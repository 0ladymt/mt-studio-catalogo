import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { ApiEnvironment } from "../src/config/env.js";
import type { AuthGateway } from "../src/types/auth.js";

const environment: ApiEnvironment = {
  APP_ENV:"test", API_HOST:"127.0.0.1", API_PORT:8787,
  SUPABASE_URL:"http://127.0.0.1:54321", SUPABASE_PUBLISHABLE_KEY:"test-key-which-is-long-enough",
  ALLOWED_ORIGINS:"http://127.0.0.1:4173", SESSION_REFRESH_MAX_AGE:2592000,
  GOOGLE_OAUTH_CALLBACK_URL:"http://127.0.0.1:8787/api/auth/google/callback",
  GOOGLE_IDENTITY_LINK_CALLBACK_URL:"http://127.0.0.1:8787/api/auth/google/link/callback",
  OAUTH_TRANSACTION_TTL_SECONDS:600, SENSITIVE_AUTHORIZATION_TTL_SECONDS:300,
  PUBLIC_SITE_URL:"http://127.0.0.1:4173",
};
const auth = { verifyAccessToken:vi.fn(async()=>null), refreshSession:vi.fn(async()=>null), revokeSession:vi.fn() } as unknown as AuthGateway;

describe("local multipart CORS", () => {
  it("allows PUT only for the configured administrative origin", async () => {
    const app=createApp(auth,environment);
    const allowed=await app.request("/api/storage-local/multipart/example/1",{method:"OPTIONS",headers:{Origin:environment.PUBLIC_SITE_URL,"Access-Control-Request-Method":"PUT","Access-Control-Request-Headers":"content-type"}});
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-methods")).toContain("PUT");
    expect(allowed.headers.get("access-control-allow-origin")).toBe(environment.PUBLIC_SITE_URL);
    const blocked=await app.request("/api/storage-local/multipart/example/1",{method:"OPTIONS",headers:{Origin:"https://evil.invalid","Access-Control-Request-Method":"PUT"}});
    expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
  });
});
