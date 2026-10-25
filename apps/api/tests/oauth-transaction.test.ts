import { describe, expect, it } from "vitest";
import { OAuthTransactionStore } from "../src/auth/oauth-transaction.js";

describe("OAuthTransactionStore", () => {
  it("consumes a transaction exactly once", () => {
    const store = new OAuthTransactionStore(60_000);
    const id = store.create({ verifier: "secret" });
    expect(store.consume(id)?.pkceStorage).toEqual({ verifier: "secret" });
    expect(store.consume(id)).toBeNull();
  });

  it("rejects expired and unknown transactions", () => {
    let now = 1_000;
    const store = new OAuthTransactionStore(100, () => now);
    const id = store.create({ verifier: "secret" });
    now = 1_101;
    expect(store.consume(id)).toBeNull();
    expect(store.consume("unknown")).toBeNull();
  });

  it("copies sensitive PKCE storage instead of retaining a mutable reference", () => {
    const source = { verifier: "original" };
    const store = new OAuthTransactionStore(60_000);
    const id = store.create(source);
    source.verifier = "tampered";
    expect(store.consume(id)?.pkceStorage.verifier).toBe("original");
  });
});
