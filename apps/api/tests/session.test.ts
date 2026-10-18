import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { ApiEnvironment } from "../src/config/env.js";
import { SESSION_COOKIES, validCsrf } from "../src/auth/cookies.js";
import { SessionManager } from "../src/auth/session.js";
import type { AuthGateway, AuthSession } from "../src/types/auth.js";

const environment: ApiEnvironment = {
  APP_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: 8787,
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "local-publishable-key-for-tests",
  ALLOWED_ORIGINS: "http://127.0.0.1:4173",
  SESSION_REFRESH_MAX_AGE: 2592000,
};

const session: AuthSession = {
  accessToken: "valid-access-token",
  refreshToken: "valid-refresh-token",
  expiresIn: 3600,
  user: { id: "11111111-1111-4111-8111-111111111111" },
};

function gateway(overrides: Partial<AuthGateway> = {}): AuthGateway {
  return {
    verifyAccessToken: vi.fn(async (token) => token === session.accessToken ? session.user : null),
    refreshSession: vi.fn(async (token) => token === session.refreshToken ? session : null),
    revokeSession: vi.fn(async () => undefined),
    signUpWithPassword: vi.fn(async () => undefined),
    confirmSignup: vi.fn(async () => true),
    resendSignupConfirmation: vi.fn(async () => undefined),
    getOwnProfile: vi.fn(async () => null),
    ...overrides,
  };
}

function cookieHeader(values: Record<string, string>): string {
  return Object.entries(values).map(([name, value]) => `${name}=${value}`).join("; ");
}

describe("secure BFF sessions", () => {
  it("accepts a valid HttpOnly cookie session", async () => {
    const manager = new SessionManager(gateway(), environment);
    const app = new Hono();
    app.get("/", async (context) => context.json(await manager.resolve(context)));
    const response = await app.request("/", {
      headers: { Cookie: cookieHeader({ [SESSION_COOKIES.access]: session.accessToken }) },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: session.user, renewed: false });
  });

  it("rotates cookies when an access token is invalid and refresh is valid", async () => {
    const auth = gateway();
    const manager = new SessionManager(auth, environment);
    const app = new Hono();
    app.get("/", async (context) => context.json(await manager.resolve(context)));
    const response = await app.request("/", {
      headers: { Cookie: cookieHeader({
        [SESSION_COOKIES.access]: "tampered-or-expired",
        [SESSION_COOKIES.refresh]: session.refreshToken,
      }) },
    });
    expect(await response.json()).toMatchObject({ renewed: true, user: session.user });
    const cookies = response.headers.getSetCookie().join("\n");
    expect(cookies).toContain(`${SESSION_COOKIES.access}=`);
    expect(cookies).toContain(`${SESSION_COOKIES.refresh}=`);
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=Lax");
    expect(cookies).not.toContain("Secure");
  });

  it("clears an invalid refresh session", async () => {
    const manager = new SessionManager(gateway(), environment);
    const app = new Hono();
    app.get("/", async (context) => context.json({ session: await manager.resolve(context) }));
    const response = await app.request("/", {
      headers: { Cookie: cookieHeader({ [SESSION_COOKIES.refresh]: "invalid-refresh" }) },
    });
    expect(await response.json()).toEqual({ session: null });
    expect(response.headers.getSetCookie().join("\n")).toContain("Max-Age=0");
  });

  it("serializes concurrent refresh attempts for the same token", async () => {
    let release!: (value: AuthSession) => void;
    const pending = new Promise<AuthSession>((resolve) => { release = resolve; });
    const refreshSession = vi.fn(async () => pending);
    const manager = new SessionManager(gateway({ refreshSession }), environment);
    const apps = [new Hono(), new Hono()];
    for (const app of apps) {
      app.get("/", async (context) => context.json(await manager.resolve(context)));
    }
    const request = { headers: { Cookie: cookieHeader({ [SESSION_COOKIES.refresh]: session.refreshToken }) } };
    const first = apps[0]!.request("/", request);
    const second = apps[1]!.request("/", request);
    await Promise.resolve();
    release(session);
    await Promise.all([first, second]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("uses constant-time double-submit CSRF validation", async () => {
    const app = new Hono();
    app.post("/", (context) => context.json({ valid: validCsrf(context) }));
    const valid = await app.request("/", {
      method: "POST",
      headers: {
        Cookie: cookieHeader({ [SESSION_COOKIES.csrf]: "csrf-value" }),
        "X-CSRF-Token": "csrf-value",
      },
    });
    expect(await valid.json()).toEqual({ valid: true });
    const invalid = await app.request("/", {
      method: "POST",
      headers: {
        Cookie: cookieHeader({ [SESSION_COOKIES.csrf]: "csrf-value" }),
        "X-CSRF-Token": "csrf-tampered",
      },
    });
    expect(await invalid.json()).toEqual({ valid: false });
  });

  it("emits Secure cookies outside local environments", async () => {
    const manager = new SessionManager(gateway(), { ...environment, APP_ENV: "production" });
    const app = new Hono();
    app.get("/", (context) => {
      manager.issue(context, session);
      return context.json({ ok: true });
    });
    const response = await app.request("/");
    expect(response.headers.getSetCookie().every((cookie) => cookie.includes("Secure"))).toBe(true);
  });

  it("replaces the CSRF value whenever a new session is issued", async () => {
    const manager = new SessionManager(gateway(), environment);
    const app = new Hono();
    app.get("/", (context) => {
      manager.issue(context, session);
      return context.json({ ok: true });
    });
    const first = await app.request("/");
    const second = await app.request("/");
    const csrf = (response: Response) => response.headers.getSetCookie()
      .find((cookie) => cookie.startsWith(`${SESSION_COOKIES.csrf}=`))
      ?.split(";", 1)[0];
    expect(csrf(first)).toBeTruthy();
    expect(csrf(second)).toBeTruthy();
    expect(csrf(first)).not.toBe(csrf(second));
  });
});
