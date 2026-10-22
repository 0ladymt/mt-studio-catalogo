import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import type { ObjectInspection, ObjectStorage } from "../types/storage.js";

const optionalSecret = z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional());
const r2EnvironmentSchema = z.object({
  STORAGE_PROVIDER: z.enum(["disabled", "r2"]).default("disabled"),
  R2_ENDPOINT: optionalSecret,
  R2_REGION: z.string().min(1).default("auto"),
  R2_BUCKET: optionalSecret,
  R2_ACCESS_KEY_ID: optionalSecret,
  R2_SECRET_ACCESS_KEY: optionalSecret,
  R2_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
}).superRefine((value, context) => {
  if (value.STORAGE_PROVIDER !== "r2") return;
  for (const field of ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const) {
    if (!value[field]) context.addIssue({ code: "custom", path: [field], message: `${field} is required for R2` });
  }
  if (value.R2_ENDPOINT && !/^https:\/\/[^/]+\.r2\.cloudflarestorage\.com$/.test(value.R2_ENDPOINT)) {
    context.addIssue({ code: "custom", path: ["R2_ENDPOINT"], message: "R2 endpoint must use the Cloudflare account endpoint" });
  }
});

type R2Configuration = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  uploadUrlTtlSeconds: number;
};

export class R2StorageError extends Error {
  constructor(readonly code: "object_missing" | "final_object_conflict" | "storage_failure") {
    super(code);
  }
}

export function createConfiguredObjectStorage(source: NodeJS.ProcessEnv): ObjectStorage | null {
  const value = r2EnvironmentSchema.parse(source);
  if (value.STORAGE_PROVIDER !== "r2") return null;
  return new R2S3Storage({
    endpoint: value.R2_ENDPOINT!,
    region: value.R2_REGION,
    bucket: value.R2_BUCKET!,
    accessKeyId: value.R2_ACCESS_KEY_ID!,
    secretAccessKey: value.R2_SECRET_ACCESS_KEY!,
    uploadUrlTtlSeconds: value.R2_UPLOAD_URL_TTL_SECONDS,
  });
}

export class R2S3Storage implements ObjectStorage {
  readonly provider = "s3" as const;
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #uploadUrlTtlSeconds: number;

  constructor(configuration: R2Configuration, client?: S3Client) {
    this.#bucket = configuration.bucket;
    this.#uploadUrlTtlSeconds = configuration.uploadUrlTtlSeconds;
    this.#client = client ?? new S3Client({
      endpoint: configuration.endpoint,
      region: configuration.region,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
    });
  }

  async createPresignedPut(input: { objectKey: string; contentType: string; sizeBytes: number; expiresAt: Date }) {
    const requestedTtl = Math.floor((input.expiresAt.getTime() - Date.now()) / 1000);
    const expiresIn = Math.max(1, Math.min(requestedTtl, this.#uploadUrlTtlSeconds));
    const stagingKey = toStagingKey(input.objectKey);
    const command = new PutObjectCommand({
      Bucket: this.#bucket,
      Key: stagingKey,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
    });
    return {
      url: await getSignedUrl(this.#client, command, { expiresIn }),
      method: "PUT" as const,
      headers: { "content-type": input.contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async inspectObject(
    objectKey: string,
    expected?: { sizeBytes: number; checksumSha256: string },
  ): Promise<ObjectInspection> {
    if (!expected) return this.#inspectWithoutTrust(toStagingKey(objectKey));
    return this.#verifyAndFinalize(toStagingKey(objectKey), objectKey, expected);
  }

  async #verifyAndFinalize(
    stagingKey: string,
    finalKey: string,
    expected: { sizeBytes: number; checksumSha256: string },
  ): Promise<ObjectInspection> {
    const existing = await this.#inspectFinal(finalKey, expected);
    if (existing) return existing;

    const temporaryDirectory = await mkdtemp(join(tmpdir(), "mt-studio-r2-"));
    const temporaryFile = join(temporaryDirectory, "object.bin");
    try {
      const observed = await this.#downloadAndHash(stagingKey, temporaryFile);
      if (!observed.exists || observed.sizeBytes !== expected.sizeBytes || observed.checksumSha256 !== expected.checksumSha256.toLowerCase()) {
        return observed;
      }

      try {
        await this.#client.send(new PutObjectCommand({
          Bucket: this.#bucket,
          Key: finalKey,
          Body: createReadStream(temporaryFile),
          ContentLength: expected.sizeBytes,
          IfNoneMatch: "*",
          Metadata: { "sha256-full-object": expected.checksumSha256.toLowerCase() },
        }));
      } catch (error) {
        if (isPreconditionFailure(error)) throw new R2StorageError("final_object_conflict");
        throw error;
      }

      const finalized = await this.#downloadAndHash(finalKey, join(temporaryDirectory, "final.bin"));
      if (!finalized.exists || finalized.sizeBytes !== expected.sizeBytes || finalized.checksumSha256 !== expected.checksumSha256.toLowerCase()) {
        throw new R2StorageError("storage_failure");
      }
      await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: stagingKey }));
      return finalized;
    } catch (error) {
      if (error instanceof R2StorageError) throw error;
      if (isNotFound(error)) return missingInspection();
      throw new R2StorageError("storage_failure");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async #inspectFinal(finalKey: string, expected: { sizeBytes: number; checksumSha256: string }): Promise<ObjectInspection | null> {
    try {
      await this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: finalKey }));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "mt-studio-r2-existing-"));
    try {
      const existing = await this.#downloadAndHash(finalKey, join(temporaryDirectory, "object.bin"));
      if (existing.sizeBytes === expected.sizeBytes && existing.checksumSha256 === expected.checksumSha256.toLowerCase()) return existing;
      throw new R2StorageError("final_object_conflict");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async #inspectWithoutTrust(key: string): Promise<ObjectInspection> {
    try {
      const result = await this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: key }));
      return { exists: true, sizeBytes: result.ContentLength ?? null, checksumSha256: null, integrity: "unverified" };
    } catch (error) {
      if (isNotFound(error)) return missingInspection();
      throw new R2StorageError("storage_failure");
    }
  }

  async #downloadAndHash(key: string, destination: string): Promise<ObjectInspection> {
    const result = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: key }));
    if (!result.Body) return missingInspection();
    const hash = createHash("sha256");
    let sizeBytes = 0;
    const hasher = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.byteLength;
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(result.Body as NodeJS.ReadableStream, hasher, createWriteStream(destination));
    return { exists: true, sizeBytes, checksumSha256: hash.digest("hex"), integrity: "trusted_full_object" };
  }
}

export function toStagingKey(finalKey: string): string {
  return `staging/${finalKey}`;
}

function missingInspection(): ObjectInspection {
  return { exists: false, sizeBytes: null, checksumSha256: null, integrity: "unverified" };
}

function isNotFound(error: unknown): boolean {
  const status = typeof error === "object" && error !== null && "$metadata" in error
    ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    : undefined;
  return status === 404 || (error instanceof Error && ["NotFound", "NoSuchKey"].includes(error.name));
}

function isPreconditionFailure(error: unknown): boolean {
  const status = typeof error === "object" && error !== null && "$metadata" in error
    ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    : undefined;
  return status === 412 || (error instanceof Error && error.name === "PreconditionFailed");
}
