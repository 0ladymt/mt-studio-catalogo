import { createHash } from "node:crypto";
import { Transform, type Readable } from "node:stream";

export type StreamIntegrityLimits = {
  maxBytes: number;
  timeoutMs: number;
};

export class StreamIntegrityError extends Error {
  constructor(readonly code: "size_limit_exceeded" | "verification_timeout" | "stream_interrupted") {
    super(code);
  }
}

export async function hashReadable(
  source: NodeJS.ReadableStream,
  limits: StreamIntegrityLimits,
): Promise<{ sizeBytes: number; checksumSha256: string }> {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  const deadline = Date.now() + limits.timeoutMs;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    const destroyable = source as NodeJS.ReadableStream & { destroy?: (error?: Error) => void };
    destroyable.destroy?.(new StreamIntegrityError("verification_timeout"));
  }, limits.timeoutMs);
  timer.unref();
  try {
    for await (const value of source as AsyncIterable<Uint8Array>) {
      if (Date.now() > deadline) throw new StreamIntegrityError("verification_timeout");
      const chunk = Buffer.from(value);
      sizeBytes += chunk.byteLength;
      if (sizeBytes > limits.maxBytes) throw new StreamIntegrityError("size_limit_exceeded");
      hash.update(chunk);
    }
  } catch (error) {
    if (timedOut) throw new StreamIntegrityError("verification_timeout");
    if (error instanceof StreamIntegrityError) throw error;
    throw new StreamIntegrityError("stream_interrupted");
  } finally {
    clearTimeout(timer);
  }
  return { sizeBytes, checksumSha256: hash.digest("hex") };
}

export function byteCountingStream(maxBytes: number): Transform {
  let sizeBytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sizeBytes += chunk.byteLength;
      callback(sizeBytes > maxBytes ? new StreamIntegrityError("size_limit_exceeded") : null, chunk);
    },
  });
}

export function asReadable(source: NodeJS.ReadableStream): Readable {
  return source as Readable;
}
