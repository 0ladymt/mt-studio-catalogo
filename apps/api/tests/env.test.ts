import { describe, expect, it } from "vitest";
import { readEnvironment } from "../src/config/env.js";

describe("API environment", () => {
  it("accepts a complete local configuration", () => {
    const environment = readEnvironment({
      APP_ENV: "test",
      API_HOST: "127.0.0.1",
      API_PORT: "8787",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_PUBLISHABLE_KEY: "local-publishable-key-for-tests",
    });
    expect(environment.APP_ENV).toBe("test");
    expect(environment.API_PORT).toBe(8787);
    expect(environment.ALLOWED_ORIGINS).toContain("127.0.0.1:4173");
    expect(environment.SESSION_REFRESH_MAX_AGE).toBe(2592000);
  });

  it("fails closed when required Supabase configuration is absent", () => {
    expect(() => readEnvironment({ APP_ENV: "test" })).toThrow();
  });
});
