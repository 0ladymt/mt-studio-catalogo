import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { SessionManager } from "../src/auth/session.js";
import { requireStaff, type StaffVariables } from "../src/middleware/require-staff.js";
import type { ApiEnvironment } from "../src/config/env.js";
import type { AdminGateway, StaffMember } from "../src/types/admin.js";
import type { AuthGateway, Profile } from "../src/types/auth.js";

const userId = "11111111-1111-4111-8111-111111111111";
const environment: ApiEnvironment = {
  APP_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: 8787,
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "local-publishable-key-for-tests",
  ALLOWED_ORIGINS: "http://127.0.0.1:4173",
  SESSION_REFRESH_MAX_AGE: 2592000,
  GOOGLE_OAUTH_CALLBACK_URL: "http://127.0.0.1:8787/api/auth/google/callback",
  GOOGLE_IDENTITY_LINK_CALLBACK_URL: "http://127.0.0.1:8787/api/auth/google/link/callback",
  OAUTH_TRANSACTION_TTL_SECONDS: 600,
  SENSITIVE_AUTHORIZATION_TTL_SECONDS: 300,
  PUBLIC_SITE_URL: "http://127.0.0.1:4173",
};

const profile: Profile = {
  user_id: userId,
  display_name: "Staff fictício",
  status: "active",
  created_at: "2026-10-19T12:00:00.000Z",
  updated_at: "2026-10-19T12:00:00.000Z",
};

function authGateway(): AuthGateway {
  return {
    verifyAccessToken: vi.fn(async (token) => token === "valid-test-token" ? { id: userId } : null),
    refreshSession: vi.fn(async () => null),
    revokeSession: vi.fn(async () => undefined),
    signUpWithPassword: vi.fn(async () => undefined),
    confirmSignup: vi.fn(async () => true),
    resendSignupConfirmation: vi.fn(async () => undefined),
    signInWithPassword: vi.fn(async () => ({ status: "invalid_credentials" as const })),
    requestPasswordRecovery: vi.fn(async () => undefined),
    resetPasswordWithOtp: vi.fn(async () => false),
    beginGoogleOAuth: vi.fn(async () => ({ authorizationUrl: "https://example.invalid", pkceStorage: {} })),
    completeGoogleOAuth: vi.fn(async () => null),
    confirmCurrentPassword: vi.fn(async () => false),
    beginGoogleIdentityLink: vi.fn(async () => ({ authorizationUrl: "https://example.invalid", pkceStorage: {} })),
    completeGoogleIdentityLink: vi.fn(async () => null),
    hasPassword: vi.fn(async () => false),
    requestPasswordSetup: vi.fn(async () => true),
    setupPasswordWithOtp: vi.fn(async () => "invalid_or_expired" as const),
    getOwnProfile: vi.fn(async () => profile),
    updateOwnProfile: vi.fn(async () => profile),
  };
}

function adminGateway(overrides: Partial<AdminGateway> = {}): AdminGateway {
  return {
    getStaffMember: vi.fn(async () => null),
    listCategories: vi.fn(async () => ({ items: [], total: 0 })),
    createCategory: vi.fn(async () => { throw new Error("unused"); }),
    updateCategory: vi.fn(async () => { throw new Error("unused"); }),
    listProducts: vi.fn(async () => ({ items: [], total: 0 })),
    getProduct: vi.fn(async () => null),
    createDraftProduct: vi.fn(async () => { throw new Error("unused"); }),
    updateDraftProduct: vi.fn(async () => { throw new Error("unused"); }),
    archiveDraftProduct: vi.fn(async () => { throw new Error("unused"); }),
    listVersions: vi.fn(async () => ({ items: [], total: 0 })),
    getVersion: vi.fn(async () => null),
    createVersion: vi.fn(async () => { throw new Error("unused"); }),
    updateVersion: vi.fn(async () => { throw new Error("unused"); }),
    retireVersion: vi.fn(async () => { throw new Error("unused"); }),
    listPrices: vi.fn(async () => ({ items: [], total: 0 })),
    getPrice: vi.fn(async () => null),
    createPrice: vi.fn(async () => { throw new Error("unused"); }),
    activatePrice: vi.fn(async () => { throw new Error("unused"); }),
    retirePrice: vi.fn(async () => { throw new Error("unused"); }),
    ...overrides,
  };
}

function staffGateway(member: StaffMember | null): AdminGateway {
  return adminGateway({ getStaffMember: vi.fn(async () => member) });
}

const request = (app: ReturnType<typeof createApp>, suffix = "") => app.request(`/api/admin/access${suffix}`, {
  headers: { Cookie: "mt_access=valid-test-token" },
});

describe("administrative authorization", () => {
  it("rejects visitors without a session before querying staff membership", async () => {
    const admin = staffGateway({ userId, role: "owner", status: "active" });
    const response = await createApp(authGateway(), environment, admin).request("/api/admin/access");
    expect(response.status).toBe(401);
    expect(admin.getStaffMember).not.toHaveBeenCalled();
  });

  it("denies an authenticated customer who is not a staff member", async () => {
    const response = await request(createApp(authGateway(), environment, staffGateway(null)));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "admin_access_denied" });
  });

  it("denies disabled staff", async () => {
    const response = await request(createApp(authGateway(), environment, staffGateway({ userId, role: "admin", status: "disabled" })));
    expect(response.status).toBe(403);
  });

  it("returns only the server-recognized support permissions", async () => {
    const response = await request(createApp(authGateway(), environment, staffGateway({ userId, role: "support", status: "active" })), "?role=owner&user_id=forged");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authorized: true,
      role: "support",
      permissions: ["admin:access", "support:read"],
    });
  });

  it("recognizes owner-only staff management permission", async () => {
    const response = await request(createApp(authGateway(), environment, staffGateway({ userId, role: "owner", status: "active" })));
    const body = await response.json() as { permissions: string[] };
    expect(body.permissions).toContain("staff:manage");
  });

  it("derives the UUID from the verified session despite forged headers", async () => {
    const admin = staffGateway({ userId, role: "catalog_manager", status: "active" });
    const app = createApp(authGateway(), environment, admin);
    const response = await app.request("/api/admin/access", {
      headers: {
        Cookie: "mt_access=valid-test-token",
        "X-User-Id": "22222222-2222-4222-8222-222222222222",
        "X-Staff-Role": "owner",
      },
    });
    expect(response.status).toBe(200);
    expect(admin.getStaffMember).toHaveBeenCalledWith(userId);
  });

  it("rechecks membership on every request so revocation is immediate", async () => {
    const getStaffMember = vi.fn()
      .mockResolvedValueOnce({ userId, role: "admin", status: "active" } satisfies StaffMember)
      .mockResolvedValueOnce(null);
    const app = createApp(authGateway(), environment, adminGateway({ getStaffMember }));
    expect((await request(app)).status).toBe(200);
    expect((await request(app)).status).toBe(403);
    expect(getStaffMember).toHaveBeenCalledTimes(2);
  });

  it("does not expose internal authorization failures", async () => {
    const admin = adminGateway({ getStaffMember: vi.fn(async () => { throw new Error("private database detail"); }) });
    const response = await request(createApp(authGateway(), environment, admin));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "admin_authorization_unavailable" });
  });

  it("rejects roles without a permission required by a protected operation", async () => {
    const sessions = new SessionManager(authGateway(), environment);
    const app = new Hono<{ Variables: StaffVariables }>();
    app.get("/owner-only", requireStaff(sessions, staffGateway({ userId, role: "admin", status: "active" }), ["staff:manage"]), (context) => context.json({ ok: true }));
    const response = await app.request("/owner-only", { headers: { Cookie: "mt_access=valid-test-token" } });
    expect(response.status).toBe(403);
  });

  it("allows an owner through an owner-only protected operation", async () => {
    const sessions = new SessionManager(authGateway(), environment);
    const app = new Hono<{ Variables: StaffVariables }>();
    app.get("/owner-only", requireStaff(sessions, staffGateway({ userId, role: "owner", status: "active" }), ["staff:manage"]), (context) => context.json({ ok: true }));
    const response = await app.request("/owner-only", { headers: { Cookie: "mt_access=valid-test-token" } });
    expect(response.status).toBe(200);
  });
});
