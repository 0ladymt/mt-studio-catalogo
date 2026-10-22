import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  type S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConfiguredObjectStorage, R2S3Storage, toStagingKey } from "../src/storage/r2-s3-storage.js";

const signed = vi.hoisted(() => vi.fn(async (_client: unknown, _command: unknown) => "https://signed.invalid/upload?redacted=true"));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: signed }));

const body = Buffer.from("arquivo ficticio pequeno da MT STUDIO");
const checksum = createHash("sha256").update(body).digest("hex");
const finalKey = "private/products/product/versions/version/files/file/upload.bin";

class FakeS3Client {
  readonly objects = new Map<string, Buffer>();
  readonly commands: unknown[] = [];
  readonly multiparts = new Map<string, { key: string; parts: Map<number, { body: Buffer; etag: string }> }>();
  listPageSize = 1_000;
  failCompleteOnce = false;

  uploadPart(uploadId: string, partNumber: number, value: Buffer) {
    const upload = this.multiparts.get(uploadId);
    if (!upload) throw noSuchUpload();
    const etag = `"${createHash("md5").update(value).digest("hex")}"`;
    upload.parts.set(partNumber, { body: Buffer.from(value), etag });
    return etag;
  }

  async send(command: unknown): Promise<Record<string, unknown>> {
    this.commands.push(command);
    if (command instanceof HeadObjectCommand) {
      const key = command.input.Key!;
      const stored = this.objects.get(key);
      if (!stored) throw notFound();
      return { ContentLength: stored.byteLength };
    }
    if (command instanceof GetObjectCommand) {
      const stored = this.objects.get(command.input.Key!);
      if (!stored) throw notFound();
      return { Body: Readable.from([stored]) };
    }
    if (command instanceof PutObjectCommand) {
      const key = command.input.Key!;
      if (command.input.IfNoneMatch === "*" && this.objects.has(key)) throw preconditionFailed();
      const chunks: Buffer[] = [];
      for await (const chunk of command.input.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
      this.objects.set(key, Buffer.concat(chunks));
      return {};
    }
    if (command instanceof DeleteObjectCommand) {
      this.objects.delete(command.input.Key!);
      return {};
    }
    if (command instanceof CreateMultipartUploadCommand) {
      const uploadId = `upload-${this.multiparts.size + 1}`;
      this.multiparts.set(uploadId, { key: command.input.Key!, parts: new Map() });
      return { UploadId: uploadId };
    }
    if (command instanceof ListPartsCommand) {
      const upload = this.multiparts.get(command.input.UploadId!);
      if (!upload) throw noSuchUpload();
      const marker = Number(command.input.PartNumberMarker ?? 0);
      const all = [...upload.parts.entries()].filter(([number]) => number > marker).sort(([left], [right]) => left - right);
      const page = all.slice(0, this.listPageSize);
      const truncated = page.length < all.length;
      return { Parts: page.map(([PartNumber, part]) => ({ PartNumber, Size: part.body.length, ETag: part.etag })), IsTruncated: truncated, NextPartNumberMarker: truncated ? String(page.at(-1)![0]) : undefined };
    }
    if (command instanceof CompleteMultipartUploadCommand) {
      if (this.failCompleteOnce) { this.failCompleteOnce = false; throw new Error("network"); }
      const upload = this.multiparts.get(command.input.UploadId!);
      if (!upload) throw noSuchUpload();
      const selected = command.input.MultipartUpload?.Parts ?? [];
      const chunks = selected.map(({ PartNumber, ETag }) => {
        const part = upload.parts.get(PartNumber!);
        if (!part || part.etag !== ETag) throw Object.assign(new Error("invalid part"), { name: "InvalidPart", $metadata: { httpStatusCode: 400 } });
        return part.body;
      });
      this.objects.set(upload.key, Buffer.concat(chunks));
      this.multiparts.delete(command.input.UploadId!);
      return {};
    }
    if (command instanceof AbortMultipartUploadCommand) {
      if (!this.multiparts.delete(command.input.UploadId!)) throw noSuchUpload();
      return {};
    }
    throw new Error("unexpected command");
  }
}

function adapter(client: FakeS3Client) {
  return new R2S3Storage({
    endpoint: "https://account.r2.cloudflarestorage.com",
    region: "auto",
    bucket: "poc",
    accessKeyId: "private-test-key",
    secretAccessKey: "private-test-secret",
    uploadUrlTtlSeconds: 300,
  }, client as unknown as S3Client);
}

describe("Cloudflare R2 S3 adapter", () => {
  beforeEach(() => signed.mockClear());

  it("stays disabled by default and requires every private server setting when enabled", () => {
    expect(createConfiguredObjectStorage({})).toBeNull();
    expect(() => createConfiguredObjectStorage({ STORAGE_PROVIDER: "r2" })).toThrow();
    expect(() => createConfiguredObjectStorage({
      STORAGE_PROVIDER: "r2",
      R2_ENDPOINT: "http://not-r2.invalid",
      R2_BUCKET: "poc",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
    })).toThrow();
  });

  it("signs only the staging key and never exposes permanent credentials", async () => {
    const client = new FakeS3Client();
    const result = await adapter(client).createPresignedPut({
      objectKey: finalKey,
      contentType: "application/octet-stream",
      sizeBytes: body.byteLength,
      expiresAt: new Date(Date.now() + 600_000),
    });
    const command = signed.mock.calls[0]![1] as PutObjectCommand;
    expect(command.input).toMatchObject({ Key: toStagingKey(finalKey), ContentLength: body.byteLength });
    expect(command.input.IfNoneMatch).toBeUndefined();
    expect(result).toMatchObject({ method: "PUT", headers: { "content-type": "application/octet-stream" } });
    expect(JSON.stringify(result)).not.toMatch(/private-test-(key|secret)/);
  });

  it("hashes the complete stored bytes, creates an immutable final object and removes staging", async () => {
    const client = new FakeS3Client();
    client.objects.set(toStagingKey(finalKey), body);
    const result = await adapter(client).inspectObject(finalKey, { sizeBytes: body.byteLength, checksumSha256: checksum });
    expect(result).toEqual({ exists: true, sizeBytes: body.byteLength, checksumSha256: checksum, integrity: "trusted_full_object" });
    expect(client.objects.get(finalKey)).toEqual(body);
    expect(client.objects.has(toStagingKey(finalKey))).toBe(false);
    const finalPut = client.commands.find((command) => command instanceof PutObjectCommand) as PutObjectCommand;
    expect(finalPut.input.IfNoneMatch).toBe("*");
  });

  it("rejects altered bytes without creating or promoting a final object", async () => {
    const client = new FakeS3Client();
    const altered = Buffer.from(body); altered[0] = altered[0]! ^ 0xff;
    client.objects.set(toStagingKey(finalKey), altered);
    const result = await adapter(client).inspectObject(finalKey, { sizeBytes: body.byteLength, checksumSha256: checksum });
    expect(result.checksumSha256).not.toBe(checksum);
    expect(result.integrity).toBe("trusted_full_object");
    expect(client.objects.has(finalKey)).toBe(false);
    expect(client.objects.has(toStagingKey(finalKey))).toBe(true);
  });

  it("is idempotent only when an existing final object has the exact expected bytes", async () => {
    const client = new FakeS3Client();
    client.objects.set(finalKey, body);
    await expect(adapter(client).inspectObject(finalKey, { sizeBytes: body.byteLength, checksumSha256: checksum }))
      .resolves.toMatchObject({ checksumSha256: checksum, integrity: "trusted_full_object" });

    const conflict = new FakeS3Client();
    conflict.objects.set(finalKey, Buffer.from("outro objeto"));
    await expect(adapter(conflict).inspectObject(finalKey, { sizeBytes: body.byteLength, checksumSha256: checksum }))
      .rejects.toMatchObject({ code: "final_object_conflict" });
  });

  it("never treats HEAD, ETag or client metadata as trusted integrity", async () => {
    const client = new FakeS3Client();
    client.objects.set(toStagingKey(finalKey), body);
    await expect(adapter(client).inspectObject(finalKey)).resolves.toEqual({
      exists: true,
      sizeBytes: body.byteLength,
      checksumSha256: null,
      integrity: "unverified",
    });
  });

  it("rehashes every staging byte before recovering a lost completion response", async () => {
    const client = new FakeS3Client();
    client.objects.set(toStagingKey(finalKey), body);
    await expect(adapter(client).inspectStagingObject!(finalKey)).resolves.toEqual({
      exists: true,
      sizeBytes: body.byteLength,
      checksumSha256: checksum,
      integrity: "trusted_full_object",
    });
  });

  it("creates, signs, paginates, reconciles and completes multipart staging", async () => {
    const client = new FakeS3Client();
    client.listPageSize = 1;
    const store = adapter(client);
    const { providerUploadId } = await store.beginMultipart!({ objectKey: finalKey, contentType: "application/octet-stream" });
    const signedPart = await store.createMultipartPartUrl!({ objectKey: finalKey, providerUploadId, partNumber: 2, sizeBytes: 4, expiresAt: new Date(Date.now() + 600_000) });
    const uploadCommand = signed.mock.calls.at(-1)![1] as UploadPartCommand;
    expect(uploadCommand.input).toMatchObject({ Key: toStagingKey(finalKey), UploadId: providerUploadId, PartNumber: 2 });
    expect(signedPart.url).not.toContain("private-test-secret");
    const second = client.uploadPart(providerUploadId, 2, Buffer.from("segunda"));
    const first = client.uploadPart(providerUploadId, 1, Buffer.from("primeira"));
    await expect(store.listMultipartParts!({ objectKey: finalKey, providerUploadId })).resolves.toEqual([
      { partNumber: 1, sizeBytes: 8, etag: first }, { partNumber: 2, sizeBytes: 7, etag: second },
    ]);
    await store.completeMultipart!({ objectKey: finalKey, providerUploadId, parts: [{ partNumber: 1, etag: first }, { partNumber: 2, etag: second }] });
    expect(client.objects.get(toStagingKey(finalKey))).toEqual(Buffer.from("primeirasegunda"));
    await expect(store.completeMultipart!({ objectKey: finalKey, providerUploadId, parts: [{ partNumber: 1, etag: first }, { partNumber: 2, etag: second }] })).rejects.toMatchObject({ code: "storage_failure" });
  });

  it("detects replacement of a part and never accepts the stale ETag", async () => {
    const client = new FakeS3Client(), store = adapter(client);
    const { providerUploadId } = await store.beginMultipart!({ objectKey: finalKey, contentType: "application/octet-stream" });
    const original = client.uploadPart(providerUploadId, 1, Buffer.from("original"));
    const replacement = client.uploadPart(providerUploadId, 1, Buffer.from("alterado"));
    expect(replacement).not.toBe(original);
    await expect(store.completeMultipart!({ objectKey: finalKey, providerUploadId, parts: [{ partNumber: 1, etag: original }] })).rejects.toMatchObject({ code: "storage_failure" });
    expect(client.objects.has(toStagingKey(finalKey))).toBe(false);
  });

  it("recovers a partial completion failure and aborts idempotently", async () => {
    const client = new FakeS3Client(), store = adapter(client);
    const { providerUploadId } = await store.beginMultipart!({ objectKey: finalKey, contentType: "application/octet-stream" });
    const etag = client.uploadPart(providerUploadId, 1, body);
    client.failCompleteOnce = true;
    await expect(store.completeMultipart!({ objectKey: finalKey, providerUploadId, parts: [{ partNumber: 1, etag }] })).rejects.toMatchObject({ code: "storage_failure" });
    await expect(store.completeMultipart!({ objectKey: finalKey, providerUploadId, parts: [{ partNumber: 1, etag }] })).resolves.toBeUndefined();
    const cancelled = await store.beginMultipart!({ objectKey: finalKey, contentType: "application/octet-stream" });
    await expect(store.abortMultipart!({ objectKey: finalKey, providerUploadId: cancelled.providerUploadId })).resolves.toBeUndefined();
    await expect(store.abortMultipart!({ objectKey: finalKey, providerUploadId: cancelled.providerUploadId })).resolves.toBeUndefined();
  });
});

function notFound() {
  return Object.assign(new Error("not found"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
}

function preconditionFailed() {
  return Object.assign(new Error("precondition failed"), { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } });
}

function noSuchUpload() {
  return Object.assign(new Error("upload not found"), { name: "NoSuchUpload", $metadata: { httpStatusCode: 404 } });
}
