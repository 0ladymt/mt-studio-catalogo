import { createHash } from "node:crypto";

type Bucket = { count: number; resetAt: number };

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  consume(rawKey: string): { allowed: boolean; retryAfter: number } {
    const currentTime = this.now();
    this.prune(currentTime);
    const key = createHash("sha256").update(rawKey).digest("base64url");
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= currentTime) {
      this.buckets.set(key, { count: 1, resetAt: currentTime + this.windowMs });
      return { allowed: true, retryAfter: 0 };
    }
    if (bucket.count >= this.limit) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000)) };
    }
    bucket.count += 1;
    return { allowed: true, retryAfter: 0 };
  }

  private prune(currentTime: number): void {
    if (this.buckets.size < 1_000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= currentTime) this.buckets.delete(key);
    }
  }
}
