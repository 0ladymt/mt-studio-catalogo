import { Hono } from "hono";
import { authenticate, type AuthVariables } from "./middleware/authenticate.js";
import type { AuthGateway } from "./types/auth.js";
import type { ApiEnvironment } from "./config/env.js";
import { SessionManager } from "./auth/session.js";
import { protectMutation, restrictedCors } from "./middleware/security.js";
import { issueCsrfCookie } from "./auth/cookies.js";
import { FixedWindowRateLimiter } from "./auth/rate-limit.js";
import { confirmationSchema, emailSchema, signupSchema } from "./auth/validation.js";

export function createApp(gateway: AuthGateway, environment: ApiEnvironment) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const sessions = new SessionManager(gateway, environment);
  const signupLimiter = new FixedWindowRateLimiter(5, 15 * 60 * 1000);
  const signupGlobalLimiter = new FixedWindowRateLimiter(30, 15 * 60 * 1000);
  const confirmationLimiter = new FixedWindowRateLimiter(5, 15 * 60 * 1000);
  const resendLimiter = new FixedWindowRateLimiter(3, 15 * 60 * 1000);

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

  app.get("/api/auth/session", async (context) => {
    const session = await sessions.resolve(context);
    if (!session) return context.json({ authenticated: false }, 200);
    return context.json({ authenticated: true, user: { id: session.user.id } });
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

async function safeJson(context: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}
