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
  GOOGLE_OAUTH_CALLBACK_URL: "http://127.0.0.1:8787/api/auth/google/callback",
  GOOGLE_IDENTITY_LINK_CALLBACK_URL: "http://127.0.0.1:8787/api/auth/google/link/callback",
  OAUTH_TRANSACTION_TTL_SECONDS: 600,
  SENSITIVE_AUTHORIZATION_TTL_SECONDS: 300,
  PUBLIC_SITE_URL: "http://127.0.0.1:4173",
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
    signUpWithPassword: vi.fn(async () => undefined),
    confirmSignup: vi.fn(async () => true),
    resendSignupConfirmation: vi.fn(async () => undefined),
    signInWithPassword: vi.fn(async () => ({ status: "invalid_credentials" as const })),
    requestPasswordRecovery: vi.fn(async () => undefined),
    resetPasswordWithOtp: vi.fn(async () => false),
    beginGoogleOAuth: vi.fn(async () => ({
      authorizationUrl: "https://accounts.google.test/authorize",
      pkceStorage: { "supabase.auth.token-code-verifier": "verifier" },
    })),
    completeGoogleOAuth: vi.fn(async () => null),
    confirmCurrentPassword: vi.fn(async () => false),
    beginGoogleIdentityLink: vi.fn(async () => ({
      authorizationUrl: "https://accounts.google.test/link",
      pkceStorage: { "supabase.auth.token-code-verifier": "link-verifier" },
    })),
    completeGoogleIdentityLink: vi.fn(async () => null),
    hasPassword: vi.fn(async () => false),
    requestPasswordSetup: vi.fn(async () => true),
    setupPasswordWithOtp: vi.fn(async () => "invalid_or_expired" as const),
    getOwnProfile: vi.fn(async () => profile),
    updateOwnProfile: vi.fn(async (_token, _userId, displayName) => ({ ...profile, display_name: displayName })),
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

  it("updates only the authenticated user's normalized display name", async () => {
    const auth = gateway();
    const response = await createApp(auth, environment).request("/api/profile", {
      method: "PATCH",
      headers: {
        Origin: environment.PUBLIC_SITE_URL,
        Cookie: "mt_access=valid-test-token; mt_csrf=proof",
        "X-CSRF-Token": "proof",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: "  Rafaella   Ávila  " }),
    });
    expect(response.status).toBe(200);
    expect(auth.updateOwnProfile).toHaveBeenCalledWith("valid-test-token", profile.user_id, "Rafaella Ávila");
    await expect(response.json()).resolves.toMatchObject({ profile: { user_id: profile.user_id, display_name: "Rafaella Ávila" } });
  });

  it("rejects extra profile fields instead of allowing identity changes", async () => {
    const auth = gateway();
    const response = await createApp(auth, environment).request("/api/profile", {
      method: "PATCH",
      headers: {
        Origin: environment.PUBLIC_SITE_URL,
        Cookie: "mt_access=valid-test-token; mt_csrf=proof",
        "X-CSRF-Token": "proof",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: "Nome válido", user_id: "22222222-2222-4222-8222-222222222222" }),
    });
    expect(response.status).toBe(400);
    expect(auth.updateOwnProfile).not.toHaveBeenCalled();
  });

  it("rejects control and invisible characters in profile names", async () => {
    const auth = gateway();
    const response = await createApp(auth, environment).request("/api/profile", {
      method: "PATCH",
      headers: {
        Origin: environment.PUBLIC_SITE_URL,
        Cookie: "mt_access=valid-test-token; mt_csrf=proof",
        "X-CSRF-Token": "proof",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: "Nome\u200Binvisível" }),
    });
    expect(response.status).toBe(400);
    expect(auth.updateOwnProfile).not.toHaveBeenCalled();
  });

  it("requires a valid session, origin and CSRF proof to update a profile", async () => {
    const auth = gateway();
    const missingSession = await createApp(auth, environment).request("/api/profile", {
      method: "PATCH",
      headers: {
        Origin: environment.PUBLIC_SITE_URL,
        Cookie: "mt_csrf=proof",
        "X-CSRF-Token": "proof",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: "Nome válido" }),
    });
    expect(missingSession.status).toBe(401);

    const invalidOrigin = await createApp(auth, environment).request("/api/profile", {
      method: "PATCH",
      headers: {
        Origin: "https://attacker.invalid",
        Cookie: "mt_access=valid-test-token; mt_csrf=proof",
        "X-CSRF-Token": "proof",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: "Nome válido" }),
    });
    expect(invalidOrigin.status).toBe(403);

    const invalidCsrf = await createApp(auth, environment).request("/api/profile", {
      method: "PATCH",
      headers: {
        Origin: environment.PUBLIC_SITE_URL,
        Cookie: "mt_access=valid-test-token; mt_csrf=proof",
        "X-CSRF-Token": "tampered",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: "Nome válido" }),
    });
    expect(invalidCsrf.status).toBe(403);
  });

  it("reports an anonymous cookie session without exposing tokens", async () => {
    const response = await createApp(gateway(), environment).request("/api/auth/session");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });

  it("reports linked access methods from the validated session", async () => {
    const auth = gateway({
      verifyAccessToken: vi.fn(async () => ({
      id: profile.user_id,
      email: "cliente@example.test",
      emailConfirmed: true,
      providers: ["email", "google"],
      })),
      hasPassword: vi.fn(async () => true),
    });
    const response = await createApp(auth, environment).request("/api/auth/access-methods", {
      headers: { Cookie: "mt_access=valid-access; mt_refresh=valid-refresh" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      emailConfirmed: true,
      methods: { password: true, google: true },
      actions: { canSetupPassword: false },
    });
  });

  it("offers password setup only to an eligible Google-only account", async () => {
    const auth = gateway({
      verifyAccessToken: vi.fn(async () => ({
        id: profile.user_id,
        email: "google@example.test",
        emailConfirmed: true,
        providers: ["google"],
      })),
      hasPassword: vi.fn(async () => false),
    });
    const response = await createApp(auth, environment).request("/api/auth/access-methods", {
      headers: { Cookie: "mt_access=valid-access; mt_refresh=valid-refresh" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      methods: { password: false, google: true },
      actions: { canSetupPassword: true },
    });
  });

  it("requests a reauthentication OTP for an eligible Google-only account", async () => {
    const user = { id: profile.user_id, email: "google@example.test", emailConfirmed: true, providers: ["google"] };
    const auth = gateway({
      verifyAccessToken: vi.fn(async () => user),
      hasPassword: vi.fn(async () => false),
      requestPasswordSetup: vi.fn(async () => true),
    });
    const response = await createApp(auth, environment).request("/api/auth/password/setup/request", {
      method: "POST",
      headers: {
        Origin: environment.PUBLIC_SITE_URL,
        Cookie: "mt_access=valid-access; mt_refresh=valid-refresh; mt_csrf=proof",
        "X-CSRF-Token": "proof",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "password_setup_code_sent" });
    expect(auth.requestPasswordSetup).toHaveBeenCalledWith(expect.objectContaining({ user }), profile.user_id);
  });

  it("blocks password setup when a password is already configured", async () => {
    const auth = gateway({
      verifyAccessToken: vi.fn(async () => ({ id: profile.user_id, emailConfirmed: true, providers: ["google"] })),
      hasPassword: vi.fn(async () => true),
    });
    const response = await createApp(auth, environment).request("/api/auth/password/setup/request", {
      method: "POST",
      headers: {
        Origin: environment.PUBLIC_SITE_URL,
        Cookie: "mt_access=valid-access; mt_refresh=valid-refresh; mt_csrf=proof",
        "X-CSRF-Token": "proof",
      },
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "password_already_configured" });
  });

  it("sets a password with the OTP, preserves the UUID and clears the session", async () => {
    const user = { id: profile.user_id, email: "google@example.test", emailConfirmed: true, providers: ["google"] };
    const auth = gateway({
      verifyAccessToken: vi.fn(async () => user),
      hasPassword: vi.fn(async () => false),
      setupPasswordWithOtp: vi.fn(async () => "updated" as const),
    });
    const response = await createApp(auth, environment).request("/api/auth/password/setup/confirm", {
      method: "POST",
      headers: {
        Origin: environment.PUBLIC_SITE_URL,
        Cookie: "mt_access=valid-access; mt_refresh=valid-refresh; mt_csrf=proof",
        "X-CSRF-Token": "proof",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: "123456", password: "New-Password!234" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "password_configured", authenticated: false });
    expect(auth.setupPasswordWithOtp).toHaveBeenCalledWith(expect.objectContaining({ user }), profile.user_id, "123456", "New-Password!234");
    expect(response.headers.getSetCookie().filter((cookie) => /mt_(access|refresh|csrf)=/.test(cookie)).every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
  });

  it("rejects invalid password setup data before changing credentials", async () => {
    const auth = gateway({
      verifyAccessToken: vi.fn(async () => ({ id: profile.user_id, emailConfirmed: true, providers: ["google"] })),
      hasPassword: vi.fn(async () => false),
    });
    const response = await createApp(auth, environment).request("/api/auth/password/setup/confirm", {
      method: "POST",
      headers: {
        Origin: environment.PUBLIC_SITE_URL,
        Cookie: "mt_access=valid-access; mt_refresh=valid-refresh; mt_csrf=proof",
        "X-CSRF-Token": "proof",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: "bad", password: "weak" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_password_setup_data" });
    expect(auth.setupPasswordWithOtp).not.toHaveBeenCalled();
  });

  it("requires recent password reauthentication before starting a Google link", async () => {
    const auth = gateway({ verifyAccessToken: vi.fn(async () => ({
      id: profile.user_id,
      email: "cliente@example.test",
      emailConfirmed: true,
      providers: ["email"],
    })) });
    const response = await createApp(auth, environment).request("/api/auth/google/link/start", {
      method: "POST",
      headers: {
        Origin: environment.PUBLIC_SITE_URL,
        Cookie: "mt_access=valid-access; mt_refresh=valid-refresh; mt_csrf=proof",
        "X-CSRF-Token": "proof",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "recent_reauthentication_required" });
  });

  it("binds a one-time Google link transaction to the original user and session", async () => {
    const verifiedUser = {
      id: profile.user_id,
      email: "cliente@example.test",
      emailConfirmed: true,
      providers: ["email"],
    };
    const linkedSession = {
      accessToken: "linked-access",
      refreshToken: "linked-refresh",
      expiresIn: 3600,
      user: { ...verifiedUser, providers: ["email", "google"] },
    };
    const auth = gateway({
      verifyAccessToken: vi.fn(async () => verifiedUser),
      confirmCurrentPassword: vi.fn(async () => true),
      completeGoogleIdentityLink: vi.fn(async () => linkedSession),
    });
    const app = createApp(auth, environment);
    const mutationHeaders = {
      Origin: environment.PUBLIC_SITE_URL,
      Cookie: "mt_access=valid-access; mt_refresh=valid-refresh; mt_csrf=proof",
      "X-CSRF-Token": "proof",
      "Content-Type": "application/json",
    };
    const reauthenticated = await app.request("/api/auth/reauthenticate-password", {
      method: "POST", headers: mutationHeaders, body: JSON.stringify({ password: "ValidPassword!1" }),
    });
    expect(reauthenticated.status).toBe(200);
    const sensitive = reauthenticated.headers.getSetCookie().find((cookie) => cookie.startsWith("mt_sensitive_auth="))!.split(";", 1)[0]!;
    const start = await app.request("/api/auth/google/link/start", {
      method: "POST",
      headers: { ...mutationHeaders, Cookie: `${mutationHeaders.Cookie}; ${sensitive}` },
      body: "{}",
    });
    expect(start.status).toBe(200);
    const transaction = start.headers.getSetCookie().find((cookie) => cookie.startsWith("mt_google_link_tx="))!.split(";", 1)[0]!;
    const callback = await app.request("/api/auth/google/link/callback?code=valid-code", {
      headers: { Cookie: `mt_access=valid-access; mt_refresh=valid-refresh; ${transaction}` },
    });
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe(`${environment.PUBLIC_SITE_URL}/?link=google-linked#conta`);
    expect(auth.completeGoogleIdentityLink).toHaveBeenCalledOnce();
    const reused = await app.request("/api/auth/google/link/callback?code=valid-code", {
      headers: { Cookie: `mt_access=valid-access; mt_refresh=valid-refresh; ${transaction}` },
    });
    expect(reused.status).toBe(400);
  });

  it("rejects a linked identity that returns a different UUID", async () => {
    const verifiedUser = { id: profile.user_id, email: "cliente@example.test", emailConfirmed: true, providers: ["email"] };
    const auth = gateway({
      verifyAccessToken: vi.fn(async () => verifiedUser),
      confirmCurrentPassword: vi.fn(async () => true),
      completeGoogleIdentityLink: vi.fn(async () => ({
        accessToken: "foreign-access", refreshToken: "foreign-refresh", expiresIn: 3600,
        user: { id: "22222222-2222-4222-8222-222222222222", providers: ["google"] },
      })),
    });
    const app = createApp(auth, environment);
    const headers = { Origin: environment.PUBLIC_SITE_URL, Cookie: "mt_access=a; mt_refresh=r; mt_csrf=p", "X-CSRF-Token": "p", "Content-Type": "application/json" };
    const reauth = await app.request("/api/auth/reauthenticate-password", { method: "POST", headers, body: JSON.stringify({ password: "ValidPassword!1" }) });
    const sensitive = reauth.headers.getSetCookie().find((cookie) => cookie.startsWith("mt_sensitive_auth="))!.split(";", 1)[0]!;
    const start = await app.request("/api/auth/google/link/start", { method: "POST", headers: { ...headers, Cookie: `${headers.Cookie}; ${sensitive}` }, body: "{}" });
    const transaction = start.headers.getSetCookie().find((cookie) => cookie.startsWith("mt_google_link_tx="))!.split(";", 1)[0]!;
    const callback = await app.request("/api/auth/google/link/callback?code=foreign", { headers: { Cookie: `mt_access=a; mt_refresh=r; ${transaction}` } });
    expect(callback.status).toBe(403);
    await expect(callback.json()).resolves.toEqual({ error: "oauth_identity_mismatch" });
    expect(auth.revokeSession).toHaveBeenCalledWith("foreign-access");
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

  it("issues an anonymous CSRF proof without auth tokens", async () => {
    const response = await createApp(gateway(), environment).request("/api/auth/csrf");
    const body = await response.json() as { csrfToken: string };
    expect(body.csrfToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain(`mt_csrf=${body.csrfToken}`);
    expect(cookies[0]).toContain("Path=/api");
    expect(cookies[0]).not.toContain("HttpOnly");
  });

  it("validates, normalizes, and accepts signup without creating a session", async () => {
    const auth = gateway();
    const app = createApp(auth, environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const csrfCookie = csrfResponse.headers.getSetCookie()[0]!.split(";", 1)[0]!;
    const response = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: csrfCookie, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "  Cliente Teste  ", email: "  USER@Example.Invalid ", password: "Senha!Segura123" }),
    });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "verification_required" });
    expect(auth.signUpWithPassword).toHaveBeenCalledWith({ displayName: "Cliente Teste", email: "user@example.invalid", password: "Senha!Segura123" });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it("rejects invalid signup data before calling Supabase", async () => {
    const auth = gateway();
    const app = createApp(auth, environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const response = await app.request("/api/auth/signup", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "X", email: "invalid", password: "weak" }),
    });
    expect(response.status).toBe(400);
    expect(auth.signUpWithPassword).not.toHaveBeenCalled();
  });

  it("returns the same accepted signup response for an existing account", async () => {
    const app = createApp(gateway(), environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const request = () => app.request("/api/auth/signup", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Mesmo Cliente", email: "same@example.invalid", password: "Senha!Segura123" }),
    });
    const first = await request();
    const second = await request();
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    await expect(second.json()).resolves.toEqual({ status: "verification_required" });
  });

  it("confirms a signup once and rejects an invalid or reused code", async () => {
    const confirmSignup = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const app = createApp(gateway({ confirmSignup }), environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const request = () => app.request("/api/auth/confirm-email", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.invalid", token: "123456" }),
    });
    expect((await request()).status).toBe(200);
    const reused = await request();
    expect(reused.status).toBe(400);
    await expect(reused.json()).resolves.toEqual({ error: "confirmation_invalid_or_expired" });
  });

  it("uses a non-enumerating response when resending verification", async () => {
    const auth = gateway();
    const app = createApp(auth, environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const response = await app.request("/api/auth/resend-verification", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unknown@example.invalid" }),
    });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "verification_sent_if_eligible" });
  });

  it("authenticates with normalized credentials and emits only HttpOnly auth cookies", async () => {
    const auth = gateway({
      signInWithPassword: vi.fn(async () => ({
        status: "authenticated" as const,
        session: {
          accessToken: "access-secret",
          refreshToken: "refresh-secret",
          expiresIn: 3600,
          user: { id: profile.user_id },
        },
      })),
    });
    const app = createApp(auth, environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ email: " USER@Example.Invalid ", password: "valid-password" }),
    });
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({ authenticated: true, user: { id: profile.user_id } });
    expect(auth.signInWithPassword).toHaveBeenCalledWith("user@example.invalid", "valid-password");
    const cookies = response.headers.getSetCookie();
    expect(cookies.find((cookie) => cookie.startsWith("mt_access="))).toContain("HttpOnly");
    expect(cookies.find((cookie) => cookie.startsWith("mt_refresh="))).toContain("HttpOnly");
    expect(cookies.find((cookie) => cookie.startsWith("mt_csrf="))).not.toContain("HttpOnly");
    expect(JSON.stringify(responseBody)).not.toMatch(/access-secret|refresh-secret/);
  });

  it("does not distinguish a missing account from a wrong password", async () => {
    const request = async (auth: AuthGateway) => {
      const app = createApp(auth, environment);
      const csrfResponse = await app.request("/api/auth/csrf");
      const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
      return app.request("/api/auth/login", {
        method: "POST",
        headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.invalid", password: "wrong" }),
      });
    };
    const wrong = await request(gateway());
    const missing = await request(gateway());
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(await wrong.json()).toEqual(await missing.json());
  });

  it("blocks a matching account until its email is confirmed", async () => {
    const app = createApp(gateway({ signInWithPassword: vi.fn(async () => ({ status: "email_not_confirmed" as const })) }), environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.invalid", password: "valid-password" }),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "email_not_confirmed" });
  });

  it("does not replace an existing authenticated session", async () => {
    const auth = gateway();
    const app = createApp(auth, environment);
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: "mt_access=existing-access; mt_csrf=proof", "X-CSRF-Token": "proof", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.invalid", password: "valid-password" }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "already_authenticated" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("starts Google OAuth only with Origin and CSRF protection", async () => {
    const auth = gateway();
    const app = createApp(auth, environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const response = await app.request("/api/auth/google/start", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:4173",
        Cookie: `mt_csrf=${csrfToken}`,
        "X-CSRF-Token": csrfToken,
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authorizationUrl: "https://accounts.google.test/authorize" });
    expect(auth.beginGoogleOAuth).toHaveBeenCalledWith(environment.GOOGLE_OAUTH_CALLBACK_URL);
    const transactionCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith("mt_oauth_tx="));
    expect(transactionCookie).toContain("HttpOnly");
    expect(transactionCookie).toContain("SameSite=Lax");
    expect(transactionCookie).toContain("Path=/api/auth/google");
  });

  it("rejects a Google callback without a matching transaction", async () => {
    const auth = gateway();
    const response = await createApp(auth, environment).request("/api/auth/google/callback?code=untrusted");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "oauth_transaction_invalid_or_expired" });
    expect(auth.completeGoogleOAuth).not.toHaveBeenCalled();
  });

  it("consumes a Google transaction once and emits the existing session cookies", async () => {
    const auth = gateway({
      completeGoogleOAuth: vi.fn(async () => ({
        accessToken: "google-access-secret",
        refreshToken: "google-refresh-secret",
        expiresIn: 3600,
        user: { id: profile.user_id, email: "google@example.invalid" },
      })),
    });
    const app = createApp(auth, environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const start = await app.request("/api/auth/google/start", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken },
    });
    const transactionCookie = start.headers.getSetCookie()
      .find((cookie) => cookie.startsWith("mt_oauth_tx="))!
      .split(";", 1)[0]!;
    const callback = () => app.request("/api/auth/google/callback?code=single-use-code", {
      headers: { Cookie: transactionCookie },
    });

    const accepted = await callback();
    expect(accepted.status).toBe(303);
    expect(accepted.headers.get("location")).toBe("http://127.0.0.1:4173/#conta");
    const cookies = accepted.headers.getSetCookie();
    expect(cookies.find((cookie) => cookie.startsWith("mt_access="))).toContain("HttpOnly");
    expect(cookies.find((cookie) => cookie.startsWith("mt_refresh="))).toContain("HttpOnly");
    expect(JSON.stringify(await accepted.text())).not.toMatch(/google-access-secret|google-refresh-secret/);

    const reused = await callback();
    expect(reused.status).toBe(400);
    expect(auth.completeGoogleOAuth).toHaveBeenCalledTimes(1);
  });

  it("consumes a cancelled Google transaction without creating a session", async () => {
    const auth = gateway();
    const app = createApp(auth, environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const start = await app.request("/api/auth/google/start", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken },
    });
    const cookie = start.headers.getSetCookie().find((value) => value.startsWith("mt_oauth_tx="))!.split(";", 1)[0]!;
    const cancelled = await app.request("/api/auth/google/callback?error=access_denied", { headers: { Cookie: cookie } });
    expect(cancelled.status).toBe(303);
    expect(cancelled.headers.get("location")).toBe("http://127.0.0.1:4173/?oauth=cancelled#login");
    expect(auth.completeGoogleOAuth).not.toHaveBeenCalled();
  });

  it("rate limits repeated login attempts", async () => {
    const app = createApp(gateway(), environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const request = () => app.request("/api/auth/login", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "limited@example.invalid", password: "wrong" }),
    });
    for (let attempt = 0; attempt < 8; attempt += 1) expect((await request()).status).toBe(401);
    const blocked = await request();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("returns the same neutral recovery response without exposing account existence", async () => {
    const auth = gateway();
    const app = createApp(auth, environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const response = await app.request("/api/auth/request-password-reset", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ email: " USER@Example.Invalid " }),
    });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "recovery_sent_if_eligible" });
    expect(auth.requestPasswordRecovery).toHaveBeenCalledWith("user@example.invalid");
  });

  it("resets a password only with a valid recovery OTP and clears local session cookies", async () => {
    const auth = gateway({ resetPasswordWithOtp: vi.fn(async () => true) });
    const app = createApp(auth, environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const response = await app.request("/api/auth/reset-password", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.invalid", token: "123456", password: "New-Password!234" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "password_updated" });
    expect(auth.resetPasswordWithOtp).toHaveBeenCalledWith("user@example.invalid", "123456", "New-Password!234");
    expect(response.headers.getSetCookie().filter((cookie) => /mt_(access|refresh|csrf)=/.test(cookie)).every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
  });

  it("rejects invalid or expired recovery codes without exposing tokens", async () => {
    const app = createApp(gateway(), environment);
    const csrfResponse = await app.request("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const response = await app.request("/api/auth/reset-password", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4173", Cookie: `mt_csrf=${csrfToken}`, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.invalid", token: "123456", password: "New-Password!234" }),
    });
    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result).toEqual({ error: "password_reset_invalid_or_expired" });
    expect(JSON.stringify(result)).not.toContain("123456");
  });
});
