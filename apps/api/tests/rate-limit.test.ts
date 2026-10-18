import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "../src/auth/rate-limit.js";

describe("authentication rate limiting", () => {
  it("blocks attempts beyond the configured window", () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(2, 10_000, () => now);
    expect(limiter.consume("user@example.invalid").allowed).toBe(true);
    expect(limiter.consume("user@example.invalid").allowed).toBe(true);
    const blocked = limiter.consume("user@example.invalid");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(10);
    now += 10_001;
    expect(limiter.consume("user@example.invalid").allowed).toBe(true);
  });

  it("isolates limits without retaining raw email addresses", () => {
    const limiter = new FixedWindowRateLimiter(1, 10_000, () => 1_000);
    expect(limiter.consume("first@example.invalid").allowed).toBe(true);
    expect(limiter.consume("second@example.invalid").allowed).toBe(true);
    expect(limiter.consume("first@example.invalid").allowed).toBe(false);
  });
});
