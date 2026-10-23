import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ObjectInspection, ObjectStorage } from "../types/storage.js";

type StoredObject = { body: Uint8Array; contentType: string; checksumSha256: string };

export class LocalS3Simulator implements ObjectStorage {
  readonly provider = "s3" as const;
  readonly #secret = randomBytes(32);
  readonly #objects = new Map<string, StoredObject>();
  readonly #origin: string;

  constructor(origin = "http://storage.local") {
    this.#origin = origin;
  }

  async createPresignedPut(input: {
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    expiresAt: Date;
  }) {
    const expires = Math.floor(input.expiresAt.getTime() / 1000);
    const token = this.#sign(input.objectKey, expires, input.contentType, input.sizeBytes);
    const url = new URL(`/private/${encodeURIComponent(input.objectKey)}`, this.#origin);
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("size", String(input.sizeBytes));
    url.searchParams.set("signature", token);
    return {
      url: url.toString(),
      method: "PUT" as const,
      headers: { "content-type": input.contentType },
      expiresAt: input.expiresAt.toISOString(),
    };
  }

  async createPresignedGet(input: { objectKey: string; displayName: string; expiresAt: Date }) {
    const expires = Math.floor(input.expiresAt.getTime() / 1000);
    const signature = this.#signGet(input.objectKey, expires);
    const url = new URL(`/private/${encodeURIComponent(input.objectKey)}`, this.#origin);
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("signature", signature);
    url.searchParams.set("download", input.displayName);
    return { url: url.toString(), method: "GET" as const, expiresAt: input.expiresAt.toISOString() };
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/private/")) return new Response(null, { status: 404 });
    const objectKey = decodeURIComponent(url.pathname.slice("/private/".length));
    const expires = Number(url.searchParams.get("expires"));
    if (request.method === "GET") {
      const signature = url.searchParams.get("signature") ?? "";
      if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000) || !this.#validSignature(signature, this.#signGet(objectKey, expires))) return new Response(null, { status: 403 });
      const object = this.#objects.get(objectKey);
      if (!object) return new Response(null, { status: 404 });
      return new Response(object.body.slice(), { status: 200, headers: { "content-type": object.contentType, "content-disposition": `attachment; filename="${(url.searchParams.get("download") ?? "download.zip").replace(/[\r\n"]/g, "_")}"` } });
    }
    if (request.method !== "PUT") return new Response(null, { status: 404 });
    const sizeBytes = Number(url.searchParams.get("size"));
    const signature = url.searchParams.get("signature") ?? "";
    const contentType = request.headers.get("content-type") ?? "";
    if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000)) return new Response(null, { status: 403 });
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || !this.#validSignature(signature, this.#sign(objectKey, expires, contentType, sizeBytes))) {
      return new Response(null, { status: 403 });
    }
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength !== sizeBytes) return new Response(null, { status: 400 });
    if (this.#objects.has(objectKey)) return new Response(null, { status: 409 });
    const checksumSha256 = createHash("sha256").update(body).digest("hex");
    this.#objects.set(objectKey, { body: body.slice(), contentType, checksumSha256 });
    return new Response(null, { status: 201 });
  }

  async inspectObject(objectKey: string): Promise<ObjectInspection> {
    const object = this.#objects.get(objectKey);
    return object
      ? { exists: true, sizeBytes: object.body.byteLength, checksumSha256: object.checksumSha256, integrity: "trusted_full_object" }
      : { exists: false, sizeBytes: null, checksumSha256: null, integrity: "unverified" };
  }

  corruptObjectForTest(objectKey: string): void {
    const object = this.#objects.get(objectKey);
    if (!object || object.body.byteLength === 0) return;
    const body = object.body.slice();
    body[0] = (body[0] ?? 0) ^ 0xff;
    this.#objects.set(objectKey, {
      ...object,
      body,
      checksumSha256: createHash("sha256").update(body).digest("hex"),
    });
  }

  isPubliclyReadable(): boolean {
    return false;
  }

  #sign(objectKey: string, expires: number, contentType: string, sizeBytes: number): string {
    return createHmac("sha256", this.#secret).update(`${objectKey}\n${expires}\n${contentType}\n${sizeBytes}`).digest("hex");
  }

  #signGet(objectKey: string, expires: number): string {
    return createHmac("sha256", this.#secret).update(`GET\n${objectKey}\n${expires}`).digest("hex");
  }

  #validSignature(received: string, expected: string): boolean {
    const left = Buffer.from(received);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
