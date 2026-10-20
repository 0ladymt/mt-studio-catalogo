import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { AdminOperationError } from "../src/services/admin-supabase.js";
import type { ApiEnvironment } from "../src/config/env.js";
import type { AdminGateway, DraftProduct, ProductCategory, ProductPrice, ProductVersion, StaffMember } from "../src/types/admin.js";
import type { AuthGateway, Profile } from "../src/types/auth.js";

const userId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const versionId = "44444444-4444-4444-8444-444444444444";
const priceId = "55555555-5555-4555-8555-555555555555";
const environment: ApiEnvironment = {
  APP_ENV: "test", API_HOST: "127.0.0.1", API_PORT: 8787,
  SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_PUBLISHABLE_KEY: "test-key",
  ALLOWED_ORIGINS: "http://127.0.0.1:4173", SESSION_REFRESH_MAX_AGE: 2592000,
  GOOGLE_OAUTH_CALLBACK_URL: "http://127.0.0.1:8787/api/auth/google/callback",
  GOOGLE_IDENTITY_LINK_CALLBACK_URL: "http://127.0.0.1:8787/api/auth/google/link/callback",
  OAUTH_TRANSACTION_TTL_SECONDS: 600, SENSITIVE_AUTHORIZATION_TTL_SECONDS: 300,
  PUBLIC_SITE_URL: "http://127.0.0.1:4173",
};
const profile: Profile = { user_id: userId, display_name: "Gestor fictício", status: "active", created_at: "2026-10-19T00:00:00Z", updated_at: "2026-10-19T00:00:00Z" };
const category: ProductCategory = { id: categoryId, slug: "roupas", name: "Roupas", description: null, sortOrder: 0, status: "active", createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z" };
const product: DraftProduct = { id: productId, categoryId, slug: "pack-teste", name: "Pack teste", description: "Descrição", status: "draft", featured: false, currentVersionId: null, publishedAt: null, createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z" };
const version: ProductVersion = { id: versionId, productId, versionLabel: "1.0", releaseSequence: 1, releaseNotes: null, status: "draft", availableFrom: null, availableUntil: null, lockedAt: null, createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z" };
const price: ProductPrice = { id: priceId, productVersionId: versionId, amountCents: 12990, currency: "BRL", status: "scheduled", validFrom: "2026-10-19T00:00:00Z", validUntil: null, lockedAt: null, createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z" };

function authGateway(): AuthGateway {
  return {
    verifyAccessToken: vi.fn(async (token) => token === "valid" ? { id: userId } : null), refreshSession: vi.fn(async () => null), revokeSession: vi.fn(async () => undefined),
    signUpWithPassword: vi.fn(async () => undefined), confirmSignup: vi.fn(async () => true), resendSignupConfirmation: vi.fn(async () => undefined), signInWithPassword: vi.fn(async () => ({ status: "invalid_credentials" as const })),
    requestPasswordRecovery: vi.fn(async () => undefined), resetPasswordWithOtp: vi.fn(async () => false), beginGoogleOAuth: vi.fn(async () => ({ authorizationUrl: "https://example.invalid", pkceStorage: {} })), completeGoogleOAuth: vi.fn(async () => null),
    confirmCurrentPassword: vi.fn(async () => false), beginGoogleIdentityLink: vi.fn(async () => ({ authorizationUrl: "https://example.invalid", pkceStorage: {} })), completeGoogleIdentityLink: vi.fn(async () => null), hasPassword: vi.fn(async () => false),
    requestPasswordSetup: vi.fn(async () => true), setupPasswordWithOtp: vi.fn(async () => "invalid_or_expired" as const), getOwnProfile: vi.fn(async () => profile), updateOwnProfile: vi.fn(async () => profile),
  };
}

function gateway(role: StaffMember["role"] = "catalog_manager", status: StaffMember["status"] = "active", overrides: Partial<AdminGateway> = {}): AdminGateway {
  return {
    getStaffMember: vi.fn(async () => ({ userId, role, status })),
    listCategories: vi.fn(async () => ({ items: [category], total: 1 })), createCategory: vi.fn(async () => category), updateCategory: vi.fn(async () => category),
    listProducts: vi.fn(async () => ({ items: [product], total: 1 })), getProduct: vi.fn(async () => product), createDraftProduct: vi.fn(async () => product), updateDraftProduct: vi.fn(async () => product), archiveDraftProduct: vi.fn(async () => ({ ...product, status: "archived" } satisfies DraftProduct)),
    listVersions: vi.fn(async () => ({ items: [version], total: 1 })), getVersion: vi.fn(async () => version), createVersion: vi.fn(async () => version), updateVersion: vi.fn(async () => version), retireVersion: vi.fn(async () => ({ ...version, status: "retired" } satisfies ProductVersion)),
    listPrices: vi.fn(async () => ({ items: [price], total: 1 })), getPrice: vi.fn(async () => price), createPrice: vi.fn(async () => price), activatePrice: vi.fn(async () => ({ ...price, status: "active" } satisfies ProductPrice)), retirePrice: vi.fn(async () => ({ ...price, status: "retired" } satisfies ProductPrice)),
    ...overrides,
  };
}

const mutationHeaders = { Origin: environment.PUBLIC_SITE_URL, Cookie: "mt_access=valid; mt_csrf=proof", "X-CSRF-Token": "proof", "Content-Type": "application/json" };
const readHeaders = { Cookie: "mt_access=valid" };
const categoryBody = { slug: "Roupás", name: "  Roupas  ", description: "", sortOrder: 0, status: "active" };
const productBody = { categoryId, slug: "Pack Teste", name: "Pack teste", description: "Descrição", featured: false };

describe("administrative draft catalog API", () => {
  it("denies customers, inactive staff, and support users", async () => {
    const noStaff = gateway(); noStaff.getStaffMember = vi.fn(async () => null);
    expect((await createApp(authGateway(), environment, noStaff).request("/api/admin/categories", { headers: readHeaders })).status).toBe(403);
    expect((await createApp(authGateway(), environment, gateway("admin", "disabled")).request("/api/admin/categories", { headers: readHeaders })).status).toBe(403);
    expect((await createApp(authGateway(), environment, gateway("support")).request("/api/admin/categories", { headers: readHeaders })).status).toBe(403);
  });

  it.each(["catalog_manager", "admin", "owner"] as const)("allows %s to create normalized categories", async (role) => {
    const admin = gateway(role);
    const response = await createApp(authGateway(), environment, admin).request("/api/admin/categories", { method: "POST", headers: mutationHeaders, body: JSON.stringify(categoryBody) });
    expect(response.status).toBe(201);
    expect(admin.createCategory).toHaveBeenCalledWith(userId, expect.any(String), { slug: "roupas", name: "Roupas", description: null, sortOrder: 0, status: "active" });
  });

  it("rejects CSRF and unauthorized origins before a mutation", async () => {
    const admin = gateway();
    const noCsrf = await createApp(authGateway(), environment, admin).request("/api/admin/categories", { method: "POST", headers: { ...mutationHeaders, "X-CSRF-Token": "wrong" }, body: JSON.stringify(categoryBody) });
    const badOrigin = await createApp(authGateway(), environment, admin).request("/api/admin/categories", { method: "POST", headers: { ...mutationHeaders, Origin: "https://evil.invalid" }, body: JSON.stringify(categoryBody) });
    expect(noCsrf.status).toBe(403); expect(badOrigin.status).toBe(403); expect(admin.createCategory).not.toHaveBeenCalled();
  });

  it("rejects extra fields and attempts to create a published product", async () => {
    const admin = gateway();
    const response = await createApp(authGateway(), environment, admin).request("/api/admin/products", { method: "POST", headers: mutationHeaders, body: JSON.stringify({ ...productBody, status: "published", role: "owner" }) });
    expect(response.status).toBe(400); expect(admin.createDraftProduct).not.toHaveBeenCalled();
  });

  it("creates products through the draft-only gateway and ignores no client identity", async () => {
    const admin = gateway();
    const response = await createApp(authGateway(), environment, admin).request("/api/admin/products", { method: "POST", headers: { ...mutationHeaders, "X-User-Id": "forged" }, body: JSON.stringify(productBody) });
    expect(response.status).toBe(201);
    expect(admin.createDraftProduct).toHaveBeenCalledWith(userId, expect.any(String), { ...productBody, slug: "pack-teste" });
  });

  it("uses predictable pagination and filters for administrative lists", async () => {
    const admin = gateway();
    const response = await createApp(authGateway(), environment, admin).request(`/api/admin/products?limit=20&offset=40&status=draft&categoryId=${categoryId}`, { headers: readHeaders });
    expect(response.status).toBe(200);
    expect(admin.listProducts).toHaveBeenCalledWith({ limit: 20, offset: 40, status: "draft", categoryId });
  });

  it("updates and archives only through the dedicated draft operations", async () => {
    const admin = gateway(); const app = createApp(authGateway(), environment, admin);
    expect((await app.request(`/api/admin/products/${productId}`, { method: "PATCH", headers: mutationHeaders, body: JSON.stringify(productBody) })).status).toBe(200);
    expect((await app.request(`/api/admin/products/${productId}/archive`, { method: "POST", headers: mutationHeaders, body: "{}" })).status).toBe(200);
    expect(admin.updateDraftProduct).toHaveBeenCalledWith(userId, expect.any(String), productId, { ...productBody, slug: "pack-teste" });
    expect(admin.archiveDraftProduct).toHaveBeenCalledWith(userId, expect.any(String), productId);
  });

  it("maps database conflicts without exposing internal details", async () => {
    const admin = gateway("catalog_manager", "active", { createCategory: vi.fn(async () => { throw new AdminOperationError("23505"); }) });
    const response = await createApp(authGateway(), environment, admin).request("/api/admin/categories", { method: "POST", headers: mutationHeaders, body: JSON.stringify(categoryBody) });
    expect(response.status).toBe(409); await expect(response.json()).resolves.toEqual({ error: "admin_conflict" });
  });

  it("creates and updates versions without accepting a client-selected status", async () => {
    const admin = gateway(); const app = createApp(authGateway(), environment, admin);
    const body = { versionLabel: " 1.0 ", releaseSequence: 1, releaseNotes: "", availableFrom: null, availableUntil: null };
    expect((await app.request(`/api/admin/products/${productId}/versions`, { method: "POST", headers: mutationHeaders, body: JSON.stringify(body) })).status).toBe(201);
    expect(admin.createVersion).toHaveBeenCalledWith(userId, expect.any(String), productId, { ...body, versionLabel: "1.0", releaseNotes: null });
    const rejected = await app.request(`/api/admin/products/${productId}/versions`, { method: "POST", headers: mutationHeaders, body: JSON.stringify({ ...body, status: "published" }) });
    expect(rejected.status).toBe(400);
  });

  it("lists, reads and retires versions through dedicated routes", async () => {
    const admin = gateway(); const app = createApp(authGateway(), environment, admin);
    expect((await app.request(`/api/admin/products/${productId}/versions?limit=10&offset=0`, { headers: readHeaders })).status).toBe(200);
    expect((await app.request(`/api/admin/versions/${versionId}`, { headers: readHeaders })).status).toBe(200);
    expect((await app.request(`/api/admin/versions/${versionId}/retire`, { method: "POST", headers: mutationHeaders, body: "{}" })).status).toBe(200);
    expect(admin.retireVersion).toHaveBeenCalledWith(userId, expect.any(String), versionId);
  });

  it("accepts only integer cent prices in BRL controlled by the server", async () => {
    const admin = gateway(); const app = createApp(authGateway(), environment, admin);
    const body = { amountCents: 12990, validFrom: "2026-10-19T00:00:00Z", validUntil: null };
    expect((await app.request(`/api/admin/versions/${versionId}/prices`, { method: "POST", headers: mutationHeaders, body: JSON.stringify(body) })).status).toBe(201);
    expect(admin.createPrice).toHaveBeenCalledWith(userId, expect.any(String), versionId, body);
    for (const invalid of [-1, 12.5, Number.MAX_SAFE_INTEGER]) {
      expect((await app.request(`/api/admin/versions/${versionId}/prices`, { method: "POST", headers: mutationHeaders, body: JSON.stringify({ ...body, amountCents: invalid }) })).status).toBe(400);
    }
    expect((await app.request(`/api/admin/versions/${versionId}/prices`, { method: "POST", headers: mutationHeaders, body: JSON.stringify({ ...body, currency: "USD" }) })).status).toBe(400);
  });

  it("lists price history and uses explicit activation and retirement operations", async () => {
    const admin = gateway(); const app = createApp(authGateway(), environment, admin);
    expect((await app.request(`/api/admin/versions/${versionId}/prices`, { headers: readHeaders })).status).toBe(200);
    expect((await app.request(`/api/admin/prices/${priceId}`, { headers: readHeaders })).status).toBe(200);
    expect((await app.request(`/api/admin/prices/${priceId}/activate`, { method: "POST", headers: mutationHeaders, body: "{}" })).status).toBe(200);
    expect((await app.request(`/api/admin/prices/${priceId}/retire`, { method: "POST", headers: mutationHeaders, body: "{}" })).status).toBe(200);
  });

  it("keeps version and price mutations protected by CSRF, Origin and catalog permissions", async () => {
    const support = gateway("support");
    const deniedRole = await createApp(authGateway(), environment, support).request(`/api/admin/versions/${versionId}/prices`, { method: "POST", headers: mutationHeaders, body: JSON.stringify({ amountCents: 1000, validFrom: "2026-10-19T00:00:00Z", validUntil: null }) });
    const badOrigin = await createApp(authGateway(), environment, gateway()).request(`/api/admin/prices/${priceId}/activate`, { method: "POST", headers: { ...mutationHeaders, Origin: "https://evil.invalid" }, body: "{}" });
    expect(deniedRole.status).toBe(403); expect(badOrigin.status).toBe(403);
  });
});
