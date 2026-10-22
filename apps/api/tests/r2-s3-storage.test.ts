import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
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
});

function notFound() {
  return Object.assign(new Error("not found"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
}

function preconditionFailed() {
  return Object.assign(new Error("precondition failed"), { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } });
}
