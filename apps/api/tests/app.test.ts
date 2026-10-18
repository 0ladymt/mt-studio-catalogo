import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AuthGateway, Profile } from "../src/types/auth.js";
import type { ApiEnvironment } from "../src/config/env.js";

const environment: ApiEnvironment = {
  APP_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: 8787,
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "local-publishable-key-for-tests",
  ALLOWED_ORIGINS: "http://127.0.0.1:4173",
  SESSION_REFRESH_MAX_AGE: 2592000,
};

const profile: Profile = {
  user_id: "11111111-1111-4111-8111-111111111111",
  display_name: "Cliente de teste",
  status: "active",
  created_at: "2026-10-18T12:00:00.000Z",
  updated_at: "2026-10-18T12:00:00.000Z",
};

function gateway(overrides: Partial<AuthGateway> = {}): AuthGateway {
  return {
    verifyAccessToken: vi.fn(async () => ({ id: profile.user_id })),
    refreshSession: vi.fn(async () => null),
    revokeSession: vi.fn(async () => undefined),
    getOwnProfile: vi.fn(async () => profile),
    ...overrides,
  };
}

describe("MT Studio API foundation", () => {
  it("exposes a public health endpoint", async () => {
    const response = await createApp(gateway(), environment).request("/api/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("rejects a missing session", async () => {
    const response = await createApp(gateway(), environment).request("/api/profile");
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });

  it("rejects a malformed authorization header", async () => {
    const response = await createApp(gateway(), environment).request("/api/profile", {
      headers: { Authorization: "Basic not-a-session" },
    });
    expect(response.status).toBe(401);
  });

  it("rejects an invalid access token", async () => {
    const auth = gateway({ verifyAccessToken: vi.fn(async () => null) });
    const response = await createApp(auth, environment).request("/api/profile", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_session" });
  });

  it("loads only the profile belonging to the verified user", async () => {
    const auth = gateway();
    const response = await createApp(auth, environment).request("/api/profile?user_id=someone-else", {
      headers: { Authorization: "Bearer valid-test-token" },
    });
    expect(response.status).toBe(200);
    expect(auth.getOwnProfile).toHaveBeenCalledWith("valid-test-token", profile.user_id);
    await expect(response.json()).resolves.toEqual({ profile });
  });

  it("does not expose a missing profile as another user", async () => {
    const response = await createApp(
      gateway({ getOwnProfile: vi.fn(async () => null) }),
      environment,
    ).request("/api/profile", {
      headers: { Authorization: "Bearer valid-test-token" },
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "profile_not_found" });
  });

  it("returns a generic unavailable response when storage fails", async () => {
    const response = await createApp(
      gateway({ getOwnProfile: vi.fn(async () => { throw new Error("private detail"); }) }),
      environment,
    ).request("/api/profile", {
      headers: { Authorization: "Bearer valid-test-token" },
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "profile_unavailable" });
  });

  it("reports an anonymous cookie session without exposing tokens", async () => {
    const response = await createApp(gateway(), environment).request("/api/auth/session");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });

  it("rejects logout without an allowed origin and CSRF proof", async () => {
    const response = await createApp(gateway(), environment).request("/api/auth/logout", {
      method: "POST",
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "origin_not_allowed" });
  });

  it("rejects logout from an untrusted origin even with matching CSRF values", async () => {
    const response = await createApp(gateway(), environment).request("/api/auth/logout", {
      method: "POST",
      headers: {
        Origin: "https://attacker.invalid",
        Cookie: "mt_csrf=proof",
        "X-CSRF-Token": "proof",
      },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "origin_not_allowed" });
  });

  it("requires matching CSRF proof for an allowed logout origin", async () => {
    const response = await createApp(gateway(), environment).request("/api/auth/logout", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:4173",
        Cookie: "mt_csrf=proof",
        "X-CSRF-Token": "tampered",
      },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "csrf_validation_failed" });
  });

  it("revokes a valid session and clears every cookie on logout", async () => {
    const auth = gateway();
    const response = await createApp(auth, environment).request("/api/auth/logout", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:4173",
        Cookie: "mt_access=valid-test-token; mt_csrf=proof",
        "X-CSRF-Token": "proof",
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
    expect(auth.revokeSession).toHaveBeenCalledWith("valid-test-token");
    const cookies = response.headers.getSetCookie().join("\n");
    expect(cookies.match(/Max-Age=0/g)).toHaveLength(3);
  });

  it("allows credentials only for configured CORS origins", async () => {
    const allowed = await createApp(gateway(), environment).request("/api/health", {
      headers: { Origin: "http://127.0.0.1:4173" },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:4173");
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");

    const denied = await createApp(gateway(), environment).request("/api/health", {
      headers: { Origin: "https://attacker.invalid" },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
});
