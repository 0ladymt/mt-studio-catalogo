import { createHash } from "node:crypto";

export class SingleFlight<T> {
  private readonly active = new Map<string, Promise<T>>();

  run(rawKey: string, operation: () => Promise<T>): Promise<T> {
    const key = createHash("sha256").update(rawKey).digest("base64url");
    const existing = this.active.get(key);
    if (existing) return existing;
    const promise = operation();
    this.active.set(key, promise);
    void promise.then(
      () => this.active.delete(key),
      () => this.active.delete(key),
    );
    return promise;
  }
}
