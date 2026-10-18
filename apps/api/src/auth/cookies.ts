import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { ApiEnvironment } from "../config/env.js";
import type { AuthSession } from "../types/auth.js";

export const SESSION_COOKIES = {
  access: "mt_access",
  refresh: "mt_refresh",
  csrf: "mt_csrf",
} as const;

const COOKIE_PATH = "/api";

function secureCookies(environment: ApiEnvironment): boolean {
  return environment.APP_ENV === "staging" || environment.APP_ENV === "production";
}

function baseOptions(environment: ApiEnvironment) {
  return {
    secure: secureCookies(environment),
    sameSite: "Lax" as const,
    path: COOKIE_PATH,
  };
}

export function issueSessionCookies(
  context: Context,
  environment: ApiEnvironment,
  session: AuthSession,
): string {
  const csrfToken = randomBytes(32).toString("base64url");
  const base = baseOptions(environment);
  setCookie(context, SESSION_COOKIES.access, session.accessToken, {
    ...base,
    httpOnly: true,
    maxAge: Math.max(1, session.expiresIn),
  });
  setCookie(context, SESSION_COOKIES.refresh, session.refreshToken, {
    ...base,
    httpOnly: true,
    maxAge: environment.SESSION_REFRESH_MAX_AGE,
  });
  setCookie(context, SESSION_COOKIES.csrf, csrfToken, {
    ...base,
    httpOnly: false,
    maxAge: environment.SESSION_REFRESH_MAX_AGE,
  });
  return csrfToken;
}

export function clearSessionCookies(context: Context, environment: ApiEnvironment): void {
  const base = baseOptions(environment);
  for (const name of Object.values(SESSION_COOKIES)) deleteCookie(context, name, base);
}

export function readSessionCookies(context: Context) {
  return {
    accessToken: getCookie(context, SESSION_COOKIES.access),
    refreshToken: getCookie(context, SESSION_COOKIES.refresh),
  };
}

export function validCsrf(context: Context): boolean {
  const cookieToken = getCookie(context, SESSION_COOKIES.csrf);
  const headerToken = context.req.header("x-csrf-token");
  if (!cookieToken || !headerToken) return false;
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  return cookieBuffer.length === headerBuffer.length && timingSafeEqual(cookieBuffer, headerBuffer);
}
