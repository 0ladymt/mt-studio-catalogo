import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AuthGateway, Profile } from "../src/types/auth.js";

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
    getOwnProfile: vi.fn(async () => profile),
    ...overrides,
  };
}

describe("MT Studio API foundation", () => {
  it("exposes a public health endpoint", async () => {
    const response = await createApp(gateway()).request("/api/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("rejects a missing session", async () => {
    const response = await createApp(gateway()).request("/api/profile");
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });

  it("rejects a malformed authorization header", async () => {
    const response = await createApp(gateway()).request("/api/profile", {
      headers: { Authorization: "Basic not-a-session" },
    });
    expect(response.status).toBe(401);
  });

  it("rejects an invalid access token", async () => {
    const auth = gateway({ verifyAccessToken: vi.fn(async () => null) });
    const response = await createApp(auth).request("/api/profile", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_session" });
  });

  it("loads only the profile belonging to the verified user", async () => {
    const auth = gateway();
    const response = await createApp(auth).request("/api/profile?user_id=someone-else", {
      headers: { Authorization: "Bearer valid-test-token" },
    });
    expect(response.status).toBe(200);
    expect(auth.getOwnProfile).toHaveBeenCalledWith("valid-test-token", profile.user_id);
    await expect(response.json()).resolves.toEqual({ profile });
  });

  it("does not expose a missing profile as another user", async () => {
    const response = await createApp(
      gateway({ getOwnProfile: vi.fn(async () => null) }),
    ).request("/api/profile", {
      headers: { Authorization: "Bearer valid-test-token" },
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "profile_not_found" });
  });

  it("returns a generic unavailable response when storage fails", async () => {
    const response = await createApp(
      gateway({ getOwnProfile: vi.fn(async () => { throw new Error("private detail"); }) }),
    ).request("/api/profile", {
      headers: { Authorization: "Bearer valid-test-token" },
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "profile_unavailable" });
  });
});
