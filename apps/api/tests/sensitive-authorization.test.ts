import { describe, expect, it } from "vitest";
import { SensitiveAuthorizationStore } from "../src/auth/sensitive-authorization.js";

describe("SensitiveAuthorizationStore", () => {
  it("accepts the bound user and session exactly once", () => {
    const store = new SensitiveAuthorizationStore(1_000, () => 100);
    const authorization = store.create("user-a", "access-a");
    expect(store.consume(authorization, "user-a", "access-a")).toBe(true);
    expect(store.consume(authorization, "user-a", "access-a")).toBe(false);
  });

  it("rejects another user, another session, and expired authorizations", () => {
    let now = 100;
    const store = new SensitiveAuthorizationStore(1_000, () => now);
    expect(store.consume(store.create("user-a", "access-a"), "user-b", "access-a")).toBe(false);
    expect(store.consume(store.create("user-a", "access-a"), "user-a", "access-b")).toBe(false);
    const expired = store.create("user-a", "access-a");
    now = 1_101;
    expect(store.consume(expired, "user-a", "access-a")).toBe(false);
  });
});
