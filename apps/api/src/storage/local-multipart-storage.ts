import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

type Session = { objectKey: string; contentType: string; createdAt: number; status: "active" | "completed" | "cancelled" };

export class LocalMultipartStorage {
  readonly #root: string;
  readonly #origin: string;
  readonly #secret = randomBytes(32);

  constructor(root: string, origin = "http://multipart.local") { this.#root = resolve(root); this.#origin = origin; }

  async beginMultipart(input: { objectKey: string; contentType: string }) {
    this.#safe(input.objectKey);
    const providerUploadId = randomUUID();
    await this.#writeSession(providerUploadId, { ...input, createdAt: Date.now(), status: "active" });
    return { providerUploadId };
  }

  async createMultipartPartUrl(input: { objectKey: string; providerUploadId: string; partNumber: number; sizeBytes: number; expiresAt: Date }) {
    const session = await this.#session(input.objectKey, input.providerUploadId);
    if (session.status !== "active" || !Number.isInteger(input.partNumber) || input.partNumber < 1 || input.partNumber > 10_000 || !Number.isInteger(input.sizeBytes) || input.sizeBytes < 1) throw new Error("invalid_part");
    const expires = Math.floor(input.expiresAt.getTime() / 1000);
    const signature = this.#sign(input.providerUploadId, input.partNumber, input.sizeBytes, expires);
    const url = new URL(`/multipart/${input.providerUploadId}/${input.partNumber}`, this.#origin);
    url.searchParams.set("size", String(input.sizeBytes)); url.searchParams.set("expires", String(expires)); url.searchParams.set("signature", signature);
    return { url: url.toString(), method: "PUT" as const, headers: { "content-type": "application/octet-stream" }, expiresAt: input.expiresAt.toISOString() };
  }

  async handle(request: Request) {
    if (request.method !== "PUT") return new Response(null, { status: 404 });
    const url = new URL(request.url), match = url.pathname.match(/^\/multipart\/([0-9a-f-]+)\/(\d+)$/);
    if (!match) return new Response(null, { status: 404 });
    const id = match[1]!, partNumber = Number(match[2]!), size = Number(url.searchParams.get("size")), expires = Number(url.searchParams.get("expires")), signature = url.searchParams.get("signature") ?? "";
    if (expires < Math.floor(Date.now() / 1000) || !this.#valid(signature, this.#sign(id, partNumber, size, expires))) return new Response(null, { status: 403 });
    let session: Session; try { session = await this.#readSession(id); } catch { return new Response(null, { status: 404 }); }
    if (session.status !== "active") return new Response(null, { status: 409 });
    const path = this.#part(id, partNumber); await mkdir(dirname(path), { recursive: true });
    let bytes = 0; const hash = createHash("sha256");
    if (!request.body) return new Response(null, { status: 400 });
    const source = readableStreamToNode(request.body, (chunk) => { bytes += chunk.length; hash.update(chunk); });
    try { await pipeline(source, createWriteStream(path, { flags: "wx" })); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return new Response(null, { status: 409 }); throw error; }
    if (bytes !== size) { await rm(path, { force: true }); return new Response(null, { status: 400 }); }
    return new Response(null, { status: 201, headers: { etag: `"${hash.digest("hex")}"` } });
  }

  async listMultipartParts(input: { objectKey: string; providerUploadId: string }) {
    const session = await this.#session(input.objectKey, input.providerUploadId);
    if (session.status === "cancelled") throw new Error("multipart_session_not_found");
    let names: string[]; try { names = await readdir(this.#folder(input.providerUploadId)); } catch { return []; }
    const parts = [];
    for (const name of names) {
      const match = name.match(/^(\d+)\.part$/); if (!match) continue;
      const partNumber = Number(match[1]), path = resolve(this.#folder(input.providerUploadId), name), info = await stat(path), hash = createHash("sha256");
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      parts.push({ partNumber, sizeBytes: info.size, etag: `"${hash.digest("hex")}"` });
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipart(input: { objectKey: string; providerUploadId: string; parts: Array<{ partNumber: number; etag: string }> }) {
    const session = await this.#session(input.objectKey, input.providerUploadId);
    if (session.status === "completed") return;
    if (session.status !== "active") throw new Error("multipart_session_not_found");
    const actual = await this.listMultipartParts(input);
    if (actual.length !== input.parts.length || actual.some((part, index) => part.partNumber !== input.parts[index]?.partNumber || part.etag !== input.parts[index]?.etag)) throw new Error("multipart_parts_mismatch");
    const destination = this.#path(`staging/${input.objectKey}`); await mkdir(dirname(destination), { recursive: true });
    let handle;
    try {
      handle = await open(destination, "wx"); await handle.close(); handle = undefined;
      const paths = actual.map((part) => this.#part(input.providerUploadId, part.partNumber));
      const source = Readable.from((async function* () { for (const path of paths) for await (const chunk of createReadStream(path)) yield chunk; })());
      await pipeline(source, createWriteStream(destination, { flags: "r+" }));
    } catch (error) { await handle?.close(); await rm(destination, { force: true }); throw error; }
    await this.#writeSession(input.providerUploadId, { ...session, status: "completed" });
    await rm(this.#folder(input.providerUploadId), { recursive: true, force: true });
  }

  async abortMultipart(input: { objectKey: string; providerUploadId: string }) {
    const session = await this.#session(input.objectKey, input.providerUploadId);
    if (session.status === "completed") throw new Error("multipart_session_completed");
    if (session.status !== "cancelled") await this.#writeSession(input.providerUploadId, { ...session, status: "cancelled" });
    await rm(this.#folder(input.providerUploadId), { recursive: true, force: true });
  }

  async cleanup() { await rm(this.#root, { recursive: true, force: true }); }
  async #session(key: string, id: string) { const session = await this.#readSession(id); if (session.objectKey !== key) throw new Error("multipart_session_not_found"); return session; }
  async #readSession(id: string): Promise<Session> { try { return JSON.parse(await readFile(this.#sessionPath(id), "utf8")) as Session; } catch { throw new Error("multipart_session_not_found"); } }
  async #writeSession(id: string, session: Session) { const path = this.#sessionPath(id); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(session), { encoding: "utf8", flag: "w" }); }
  #sessionPath(id: string) { return this.#path(`multipart-sessions/${id}.json`); }
  #folder(id: string) { return this.#path(`multipart/${id}`); }
  #part(id: string, number: number) { return this.#path(`multipart/${id}/${number}.part`); }
  #path(key: string) { const path = resolve(this.#root, ...key.split("/")); if (path !== this.#root && !path.startsWith(this.#root + sep)) throw new Error("unsafe_key"); return path; }
  #safe(key: string) { this.#path(key); if (key.includes("\\") || key.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("unsafe_key"); }
  #sign(id: string, number: number, size: number, expires: number) { return createHmac("sha256", this.#secret).update(`${id}\n${number}\n${size}\n${expires}`).digest("hex"); }
  #valid(actual: string, expected: string) { const a = Buffer.from(actual), b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); }
}

function readableStreamToNode(stream: ReadableStream<Uint8Array>, onChunk: (chunk: Buffer) => void) {
  const reader = stream.getReader();
  return new Readable({ async read() { try { const { done, value } = await reader.read(); if (done) this.push(null); else { const chunk = Buffer.from(value); onChunk(chunk); this.push(chunk); } } catch (error) { this.destroy(error as Error); } } });
}
