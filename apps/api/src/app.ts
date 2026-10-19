import { Hono } from "hono";
import { authenticate, type AuthVariables } from "./middleware/authenticate.js";
import type { AuthGateway } from "./types/auth.js";
import type { ApiEnvironment } from "./config/env.js";
import { SessionManager } from "./auth/session.js";
import { protectMutation, restrictedCors } from "./middleware/security.js";
import { issueCsrfCookie } from "./auth/cookies.js";
import { FixedWindowRateLimiter } from "./auth/rate-limit.js";
import { confirmationSchema, emailSchema, loginSchema, passwordConfirmationSchema, passwordResetSchema, signupSchema } from "./auth/validation.js";
import { SingleFlight } from "./auth/single-flight.js";
import type { LoginResult } from "./types/auth.js";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { OAuthTransactionStore } from "./auth/oauth-transaction.js";
import { fingerprintSession, SensitiveAuthorizationStore } from "./auth/sensitive-authorization.js";

const OAUTH_TRANSACTION_COOKIE = "mt_oauth_tx";
const GOOGLE_LINK_TRANSACTION_COOKIE = "mt_google_link_tx";
const SENSITIVE_AUTHORIZATION_COOKIE = "mt_sensitive_auth";

export function createApp(gateway: AuthGateway, environment: ApiEnvironment) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const sessions = new SessionManager(gateway, environment);
  const signupLimiter = new FixedWindowRateLimiter(5, 15 * 60 * 1000);
  const signupGlobalLimiter = new FixedWindowRateLimiter(30, 15 * 60 * 1000);
  const confirmationLimiter = new FixedWindowRateLimiter(5, 15 * 60 * 1000);
  const resendLimiter = new FixedWindowRateLimiter(3, 15 * 60 * 1000);
  const loginLimiter = new FixedWindowRateLimiter(8, 15 * 60 * 1000);
  const loginGlobalLimiter = new FixedWindowRateLimiter(60, 15 * 60 * 1000);
  const recoveryLimiter = new FixedWindowRateLimiter(3, 15 * 60 * 1000);
  const recoveryGlobalLimiter = new FixedWindowRateLimiter(30, 15 * 60 * 1000);
  const passwordResetLimiter = new FixedWindowRateLimiter(5, 15 * 60 * 1000);
  const googleOAuthStartLimiter = new FixedWindowRateLimiter(30, 15 * 60 * 1000);
  const logins = new SingleFlight<LoginResult>();
  const oauthTransactions = new OAuthTransactionStore(environment.OAUTH_TRANSACTION_TTL_SECONDS * 1000);
  const googleLinkTransactions = new OAuthTransactionStore(environment.OAUTH_TRANSACTION_TTL_SECONDS * 1000);
  const sensitiveAuthorizations = new SensitiveAuthorizationStore(environment.SENSITIVE_AUTHORIZATION_TTL_SECONDS * 1000);

  app.use("/api/*", restrictedCors(environment));

  app.get("/api/health", (context) => context.json({ status: "ok" }));

  app.get("/api/auth/csrf", (context) => {
    const csrfToken = issueCsrfCookie(context, environment);
    return context.json({ csrfToken });
  });

  app.post("/api/auth/signup", protectMutation(environment), async (context) => {
    const input = signupSchema.safeParse(await safeJson(context));
    if (!input.success) return context.json({ error: "invalid_signup_data" }, 400);
    const rates = [signupGlobalLimiter.consume("signup-global"), signupLimiter.consume(input.data.email)];
    const denied = rates.find((rate) => !rate.allowed);
    if (denied) {
      context.header("Retry-After", String(denied.retryAfter));
      return context.json({ error: "too_many_requests" }, 429);
    }
    try {
      await gateway.signUpWithPassword(input.data);
      return context.json({ status: "verification_required" }, 202);
    } catch {
      return context.json({ error: "signup_temporarily_unavailable" }, 503);
    }
  });

  app.post("/api/auth/confirm-email", protectMutation(environment), async (context) => {
    const input = confirmationSchema.safeParse(await safeJson(context));
    if (!input.success) return context.json({ error: "invalid_confirmation_data" }, 400);
    const rate = confirmationLimiter.consume(input.data.email);
    if (!rate.allowed) {
      context.header("Retry-After", String(rate.retryAfter));
      return context.json({ error: "too_many_requests" }, 429);
    }
    try {
      const confirmed = await gateway.confirmSignup(input.data.email, input.data.token);
      if (!confirmed) return context.json({ error: "confirmation_invalid_or_expired" }, 400);
      return context.json({ status: "email_confirmed" });
    } catch {
      return context.json({ error: "confirmation_temporarily_unavailable" }, 503);
    }
  });

  app.post("/api/auth/resend-verification", protectMutation(environment), async (context) => {
    const input = emailSchema.safeParse(await safeJson(context));
    if (!input.success) return context.json({ error: "invalid_email" }, 400);
    const rate = resendLimiter.consume(input.data.email);
    if (!rate.allowed) {
      context.header("Retry-After", String(rate.retryAfter));
      return context.json({ error: "too_many_requests" }, 429);
    }
    try {
      await gateway.resendSignupConfirmation(input.data.email);
      return context.json({ status: "verification_sent_if_eligible" }, 202);
    } catch {
      return context.json({ error: "verification_temporarily_unavailable" }, 503);
    }
  });

  app.post("/api/auth/login", protectMutation(environment), async (context) => {
    const input = loginSchema.safeParse(await safeJson(context));
    if (!input.success) return context.json({ error: "invalid_login_data" }, 400);

    const currentSession = await sessions.resolve(context);
    if (currentSession) return context.json({ error: "already_authenticated" }, 409);

    const rates = [loginGlobalLimiter.consume("login-global"), loginLimiter.consume(input.data.email)];
    const denied = rates.find((rate) => !rate.allowed);
    if (denied) {
      context.header("Retry-After", String(denied.retryAfter));
      return context.json({ error: "too_many_requests" }, 429);
    }

    try {
      const result = await logins.run(
        `${input.data.email}\0${input.data.password}`,
        () => gateway.signInWithPassword(input.data.email, input.data.password),
      );
      if (result.status === "invalid_credentials") {
        return context.json({ error: "invalid_credentials" }, 401);
      }
      if (result.status === "email_not_confirmed") {
        return context.json({ error: "email_not_confirmed" }, 403);
      }
      sessions.issue(context, result.session);
      return context.json({ authenticated: true, user: result.session.user });
    } catch {
      return context.json({ error: "login_temporarily_unavailable" }, 503);
    }
  });

  app.post("/api/auth/google/start", protectMutation(environment), async (context) => {
    const currentSession = await sessions.resolve(context);
    if (currentSession) return context.json({ error: "already_authenticated" }, 409);
    const rate = googleOAuthStartLimiter.consume("google-oauth-start");
    if (!rate.allowed) {
      context.header("Retry-After", String(rate.retryAfter));
      return context.json({ error: "too_many_requests" }, 429);
    }
    try {
      const oauth = await gateway.beginGoogleOAuth(environment.GOOGLE_OAUTH_CALLBACK_URL);
      const transactionId = oauthTransactions.create(oauth.pkceStorage);
      setCookie(context, OAUTH_TRANSACTION_COOKIE, transactionId, oauthCookieOptions(environment));
      return context.json({ authorizationUrl: oauth.authorizationUrl });
    } catch {
      return context.json({ error: "google_oauth_temporarily_unavailable" }, 503);
    }
  });

  app.get("/api/auth/google/callback", async (context) => {
    const transactionId = getCookie(context, OAUTH_TRANSACTION_COOKIE);
    const transaction = oauthTransactions.consume(transactionId);
    deleteCookie(context, OAUTH_TRANSACTION_COOKIE, oauthCookieOptions(environment));
    if (!transaction) return context.json({ error: "oauth_transaction_invalid_or_expired" }, 400);

    const providerError = context.req.query("error");
    if (providerError) return context.redirect(`${environment.PUBLIC_SITE_URL}/?oauth=cancelled#login`, 303);

    const code = context.req.query("code");
    if (!code) return context.json({ error: "oauth_callback_invalid" }, 400);
    try {
      const session = await gateway.completeGoogleOAuth(code, transaction.pkceStorage);
      if (!session) return context.json({ error: "oauth_callback_invalid" }, 400);
      sessions.issue(context, session);
      return context.redirect(`${environment.PUBLIC_SITE_URL}/#conta`, 303);
    } catch {
      return context.json({ error: "google_oauth_temporarily_unavailable" }, 503);
    }
  });

  app.post("/api/auth/request-password-reset", protectMutation(environment), async (context) => {
    const input = emailSchema.safeParse(await safeJson(context));
    if (!input.success) return context.json({ error: "invalid_email" }, 400);
    const rates = [recoveryGlobalLimiter.consume("recovery-global"), recoveryLimiter.consume(input.data.email)];
    const denied = rates.find((rate) => !rate.allowed);
    if (denied) {
      context.header("Retry-After", String(denied.retryAfter));
      return context.json({ error: "too_many_requests" }, 429);
    }
    try {
      await gateway.requestPasswordRecovery(input.data.email);
      return context.json({ status: "recovery_sent_if_eligible" }, 202);
    } catch {
      return context.json({ error: "recovery_temporarily_unavailable" }, 503);
    }
  });

  app.post("/api/auth/reset-password", protectMutation(environment), async (context) => {
    const input = passwordResetSchema.safeParse(await safeJson(context));
    if (!input.success) return context.json({ error: "invalid_password_reset_data" }, 400);
    const rate = passwordResetLimiter.consume(input.data.email);
    if (!rate.allowed) {
      context.header("Retry-After", String(rate.retryAfter));
      return context.json({ error: "too_many_requests" }, 429);
    }
    try {
      const reset = await gateway.resetPasswordWithOtp(input.data.email, input.data.token, input.data.password);
      if (!reset) return context.json({ error: "password_reset_invalid_or_expired" }, 400);
      sessions.clear(context);
      return context.json({ status: "password_updated" });
    } catch {
      return context.json({ error: "password_reset_temporarily_unavailable" }, 503);
    }
  });

  app.get("/api/auth/session", async (context) => {
    const session = await sessions.resolve(context);
    if (!session) return context.json({ authenticated: false }, 200);
    return context.json({ authenticated: true, user: session.user });
  });

  app.get("/api/auth/access-methods", async (context) => {
    const session = await sessions.resolve(context);
    if (!session) return context.json({ error: "authentication_required" }, 401);
    return context.json({
      emailConfirmed: Boolean(session.user.emailConfirmed),
      methods: {
        password: session.user.providers?.includes("email") ?? false,
        google: session.user.providers?.includes("google") ?? false,
      },
    });
  });

  app.post("/api/auth/reauthenticate-password", protectMutation(environment), async (context) => {
    const session = await sessions.resolve(context);
    if (!session) return context.json({ error: "authentication_required" }, 401);
    if (!session.user.emailConfirmed || !session.user.email || !session.user.providers?.includes("email")) {
      return context.json({ error: "password_reauthentication_unavailable" }, 409);
    }
    const input = passwordConfirmationSchema.safeParse(await safeJson(context));
    if (!input.success) return context.json({ error: "invalid_password_confirmation" }, 400);
    try {
      const confirmed = await gateway.confirmCurrentPassword(session.user.email, input.data.password, session.user.id);
      if (!confirmed) return context.json({ error: "invalid_credentials" }, 401);
      const authorizationId = sensitiveAuthorizations.create(session.user.id, session.accessToken);
      setCookie(context, SENSITIVE_AUTHORIZATION_COOKIE, authorizationId, sensitiveCookieOptions(environment));
      return context.json({ authorized: true });
    } catch {
      return context.json({ error: "reauthentication_temporarily_unavailable" }, 503);
    }
  });

  app.post("/api/auth/google/link/start", protectMutation(environment), async (context) => {
    const session = await sessions.resolve(context);
    if (!session || !session.refreshToken) return context.json({ error: "authentication_required" }, 401);
    if (!session.user.emailConfirmed || !session.user.providers?.includes("email")) {
      return context.json({ error: "google_link_not_eligible" }, 409);
    }
    if (session.user.providers.includes("google")) return context.json({ error: "google_already_linked" }, 409);
    const authorizationId = getCookie(context, SENSITIVE_AUTHORIZATION_COOKIE);
    deleteCookie(context, SENSITIVE_AUTHORIZATION_COOKIE, sensitiveCookieOptions(environment));
    if (!sensitiveAuthorizations.consume(authorizationId, session.user.id, session.accessToken)) {
      return context.json({ error: "recent_reauthentication_required" }, 403);
    }
    try {
      const oauth = await gateway.beginGoogleIdentityLink({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: 60,
        user: session.user,
      }, environment.GOOGLE_IDENTITY_LINK_CALLBACK_URL);
      const transactionId = googleLinkTransactions.create(oauth.pkceStorage, {
        expectedUserId: session.user.id,
        sessionFingerprint: fingerprintSession(session.accessToken),
      });
      setCookie(context, GOOGLE_LINK_TRANSACTION_COOKIE, transactionId, googleLinkCookieOptions(environment));
      return context.json({ authorizationUrl: oauth.authorizationUrl });
    } catch {
      return context.json({ error: "google_link_temporarily_unavailable" }, 503);
    }
  });

  app.get("/api/auth/google/link/callback", async (context) => {
    const transactionId = getCookie(context, GOOGLE_LINK_TRANSACTION_COOKIE);
    const transaction = googleLinkTransactions.consume(transactionId);
    deleteCookie(context, GOOGLE_LINK_TRANSACTION_COOKIE, googleLinkCookieOptions(environment));
    if (!transaction?.expectedUserId || !transaction.sessionFingerprint) {
      return context.json({ error: "oauth_transaction_invalid_or_expired" }, 400);
    }
    const current = await sessions.resolve(context);
    if (!current || current.user.id !== transaction.expectedUserId || fingerprintSession(current.accessToken) !== transaction.sessionFingerprint) {
      return context.json({ error: "oauth_session_mismatch" }, 403);
    }
    if (context.req.query("error")) {
      return context.redirect(`${environment.PUBLIC_SITE_URL}/?link=cancelled#conta`, 303);
    }
    const code = context.req.query("code");
    if (!code) return context.json({ error: "oauth_callback_invalid" }, 400);
    try {
      const linkedSession = await gateway.completeGoogleIdentityLink(code, transaction.pkceStorage);
      if (!linkedSession || linkedSession.user.id !== transaction.expectedUserId) {
        if (linkedSession) await gateway.revokeSession(linkedSession.accessToken);
        return context.json({ error: "oauth_identity_mismatch" }, 403);
      }
      sessions.issue(context, linkedSession);
      return context.redirect(`${environment.PUBLIC_SITE_URL}/?link=google-linked#conta`, 303);
    } catch {
      return context.redirect(`${environment.PUBLIC_SITE_URL}/?link=failed#conta`, 303);
    }
  });

  app.post("/api/auth/logout", protectMutation(environment), async (context) => {
    await sessions.logout(context);
    return context.json({ authenticated: false });
  });

  app.get("/api/profile", authenticate(sessions, true), async (context) => {
    const user = context.get("user");
    const token = context.get("accessToken");

    try {
      const profile = await gateway.getOwnProfile(token, user.id);
      if (!profile) return context.json({ error: "profile_not_found" }, 404);
      return context.json({ profile });
    } catch {
      return context.json({ error: "profile_unavailable" }, 503);
    }
  });

  app.notFound((context) => context.json({ error: "not_found" }, 404));
  return app;
}

function oauthCookieOptions(environment: ApiEnvironment) {
  return {
    httpOnly: true,
    secure: environment.APP_ENV === "staging" || environment.APP_ENV === "production",
    sameSite: "Lax" as const,
    path: "/api/auth/google",
    maxAge: environment.OAUTH_TRANSACTION_TTL_SECONDS,
  };
}

function googleLinkCookieOptions(environment: ApiEnvironment) {
  return { ...oauthCookieOptions(environment), path: "/api/auth/google/link" };
}

function sensitiveCookieOptions(environment: ApiEnvironment) {
  return {
    httpOnly: true,
    secure: environment.APP_ENV === "staging" || environment.APP_ENV === "production",
    sameSite: "Lax" as const,
    path: "/api/auth/google/link",
    maxAge: environment.SENSITIVE_AUTHORIZATION_TTL_SECONDS,
  };
}

async function safeJson(context: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}
