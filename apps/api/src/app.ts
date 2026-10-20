import { Hono, type Context } from "hono";
import { z } from "zod";
import { authenticate, type AuthVariables } from "./middleware/authenticate.js";
import type { AuthGateway } from "./types/auth.js";
import type { ApiEnvironment } from "./config/env.js";
import { SessionManager } from "./auth/session.js";
import { protectMutation, restrictedCors } from "./middleware/security.js";
import { issueCsrfCookie } from "./auth/cookies.js";
import { FixedWindowRateLimiter } from "./auth/rate-limit.js";
import { confirmationSchema, emailSchema, loginSchema, passwordConfirmationSchema, passwordResetSchema, passwordSetupSchema, profileUpdateSchema, signupSchema } from "./auth/validation.js";
import { SingleFlight } from "./auth/single-flight.js";
import type { LoginResult } from "./types/auth.js";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { OAuthTransactionStore } from "./auth/oauth-transaction.js";
import { fingerprintSession, SensitiveAuthorizationStore } from "./auth/sensitive-authorization.js";
import { randomUUID } from "node:crypto";
import type { AdminGateway } from "./types/admin.js";
import { permissionsForRole } from "./auth/staff-permissions.js";
import { requireStaff, type StaffVariables } from "./middleware/require-staff.js";
import { AdminOperationError, unavailableAdminGateway } from "./services/admin-supabase.js";
import { categoryInputSchema, fileInputSchema, fileUpdateSchema, identifierSchema, mediaInputSchema, mediaUpdateSchema, paginationSchema, priceInputSchema, productInputSchema, productListQuerySchema, versionInputSchema } from "./admin/validation.js";

const OAUTH_TRANSACTION_COOKIE = "mt_oauth_tx";
const GOOGLE_LINK_TRANSACTION_COOKIE = "mt_google_link_tx";
const SENSITIVE_AUTHORIZATION_COOKIE = "mt_sensitive_auth";
const zEmptyObject = z.object({}).strict();

export function createApp(
  gateway: AuthGateway,
  environment: ApiEnvironment,
  adminGateway: AdminGateway = unavailableAdminGateway(),
) {
  const app = new Hono<{ Variables: AuthVariables & StaffVariables }>();
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
  const passwordSetupLimiter = new FixedWindowRateLimiter(5, 15 * 60 * 1000);
  const passwordSetupGlobalLimiter = new FixedWindowRateLimiter(30, 15 * 60 * 1000);
  const googleOAuthStartLimiter = new FixedWindowRateLimiter(30, 15 * 60 * 1000);
  const logins = new SingleFlight<LoginResult>();
  const oauthTransactions = new OAuthTransactionStore(environment.OAUTH_TRANSACTION_TTL_SECONDS * 1000);
  const googleLinkTransactions = new OAuthTransactionStore(environment.OAUTH_TRANSACTION_TTL_SECONDS * 1000);
  const sensitiveAuthorizations = new SensitiveAuthorizationStore(environment.SENSITIVE_AUTHORIZATION_TTL_SECONDS * 1000);

  app.use("/api/*", restrictedCors(environment));

  app.get("/api/health", (context) => context.json({ status: "ok" }));

  app.get(
    "/api/admin/access",
    requireStaff(sessions, adminGateway),
    (context) => {
      const staff = context.get("staff");
      return context.json({
        authorized: true,
        role: staff.role,
        permissions: permissionsForRole(staff.role),
      });
    },
  );

  app.get("/api/admin/categories", requireStaff(sessions, adminGateway, ["catalog:read"]), async (context) => {
    const input = paginationSchema.safeParse(context.req.query());
    if (!input.success) return context.json({ error: "invalid_pagination" }, 400);
    try {
      const page = await adminGateway.listCategories(input.data);
      return context.json({ ...page, ...input.data });
    } catch (error) {
      return adminErrorResponse(context, error);
    }
  });

  app.post(
    "/api/admin/categories",
    protectMutation(environment),
    requireStaff(sessions, adminGateway, ["catalog:write"]),
    async (context) => {
      const input = categoryInputSchema.safeParse(await safeJson(context));
      if (!input.success) return context.json({ error: "invalid_category_data" }, 400);
      try {
        const category = await adminGateway.createCategory(context.get("user").id, randomUUID(), input.data);
        return context.json({ category }, 201);
      } catch (error) {
        return adminErrorResponse(context, error);
      }
    },
  );

  app.patch(
    "/api/admin/categories/:id",
    protectMutation(environment),
    requireStaff(sessions, adminGateway, ["catalog:write"]),
    async (context) => {
      const categoryId = identifierSchema.safeParse(context.req.param("id"));
      const input = categoryInputSchema.safeParse(await safeJson(context));
      if (!categoryId.success || !input.success) return context.json({ error: "invalid_category_data" }, 400);
      try {
        const category = await adminGateway.updateCategory(context.get("user").id, randomUUID(), categoryId.data, input.data);
        return context.json({ category });
      } catch (error) {
        return adminErrorResponse(context, error);
      }
    },
  );

  app.get("/api/admin/products", requireStaff(sessions, adminGateway, ["catalog:read"]), async (context) => {
    const input = productListQuerySchema.safeParse(context.req.query());
    if (!input.success) return context.json({ error: "invalid_product_query" }, 400);
    try {
      const page = await adminGateway.listProducts(input.data);
      return context.json({ ...page, ...input.data });
    } catch (error) {
      return adminErrorResponse(context, error);
    }
  });

  app.get("/api/admin/products/:id", requireStaff(sessions, adminGateway, ["catalog:read"]), async (context) => {
    const productId = identifierSchema.safeParse(context.req.param("id"));
    if (!productId.success) return context.json({ error: "invalid_product_id" }, 400);
    try {
      const product = await adminGateway.getProduct(productId.data);
      if (!product) return context.json({ error: "product_not_found" }, 404);
      return context.json({ product });
    } catch (error) {
      return adminErrorResponse(context, error);
    }
  });

  app.post(
    "/api/admin/products",
    protectMutation(environment),
    requireStaff(sessions, adminGateway, ["catalog:write"]),
    async (context) => {
      const input = productInputSchema.safeParse(await safeJson(context));
      if (!input.success) return context.json({ error: "invalid_product_data" }, 400);
      try {
        const product = await adminGateway.createDraftProduct(context.get("user").id, randomUUID(), input.data);
        return context.json({ product }, 201);
      } catch (error) {
        return adminErrorResponse(context, error);
      }
    },
  );

  app.patch(
    "/api/admin/products/:id",
    protectMutation(environment),
    requireStaff(sessions, adminGateway, ["catalog:write"]),
    async (context) => {
      const productId = identifierSchema.safeParse(context.req.param("id"));
      const input = productInputSchema.safeParse(await safeJson(context));
      if (!productId.success || !input.success) return context.json({ error: "invalid_product_data" }, 400);
      try {
        const product = await adminGateway.updateDraftProduct(context.get("user").id, randomUUID(), productId.data, input.data);
        return context.json({ product });
      } catch (error) {
        return adminErrorResponse(context, error);
      }
    },
  );

  app.post(
    "/api/admin/products/:id/archive",
    protectMutation(environment),
    requireStaff(sessions, adminGateway, ["catalog:write"]),
    async (context) => {
      const productId = identifierSchema.safeParse(context.req.param("id"));
      const input = zEmptyObject.safeParse(await safeJson(context));
      if (!productId.success || !input.success) return context.json({ error: "invalid_product_archive_data" }, 400);
      try {
        const product = await adminGateway.archiveDraftProduct(context.get("user").id, randomUUID(), productId.data);
        return context.json({ product });
      } catch (error) {
        return adminErrorResponse(context, error);
      }
    },
  );

  app.get("/api/admin/products/:id/versions", requireStaff(sessions, adminGateway, ["catalog:read"]), async (context) => {
    const productId = identifierSchema.safeParse(context.req.param("id"));
    const page = paginationSchema.safeParse(context.req.query());
    if (!productId.success || !page.success) return context.json({ error: "invalid_version_query" }, 400);
    try {
      const result = await adminGateway.listVersions(productId.data, page.data);
      return context.json({ ...result, ...page.data });
    } catch (error) { return adminErrorResponse(context, error); }
  });

  app.post(
    "/api/admin/products/:id/versions", protectMutation(environment),
    requireStaff(sessions, adminGateway, ["catalog:write"]), async (context) => {
      const productId = identifierSchema.safeParse(context.req.param("id"));
      const input = versionInputSchema.safeParse(await safeJson(context));
      if (!productId.success || !input.success) return context.json({ error: "invalid_version_data" }, 400);
      try {
        const version = await adminGateway.createVersion(context.get("user").id, randomUUID(), productId.data, input.data);
        return context.json({ version }, 201);
      } catch (error) { return adminErrorResponse(context, error); }
    },
  );

  app.get("/api/admin/versions/:id", requireStaff(sessions, adminGateway, ["catalog:read"]), async (context) => {
    const versionId = identifierSchema.safeParse(context.req.param("id"));
    if (!versionId.success) return context.json({ error: "invalid_version_id" }, 400);
    try {
      const version = await adminGateway.getVersion(versionId.data);
      return version ? context.json({ version }) : context.json({ error: "version_not_found" }, 404);
    } catch (error) { return adminErrorResponse(context, error); }
  });

  app.patch(
    "/api/admin/versions/:id", protectMutation(environment),
    requireStaff(sessions, adminGateway, ["catalog:write"]), async (context) => {
      const versionId = identifierSchema.safeParse(context.req.param("id"));
      const input = versionInputSchema.safeParse(await safeJson(context));
      if (!versionId.success || !input.success) return context.json({ error: "invalid_version_data" }, 400);
      try {
        const version = await adminGateway.updateVersion(context.get("user").id, randomUUID(), versionId.data, input.data);
        return context.json({ version });
      } catch (error) { return adminErrorResponse(context, error); }
    },
  );

  app.post(
    "/api/admin/versions/:id/retire", protectMutation(environment),
    requireStaff(sessions, adminGateway, ["catalog:write"]), async (context) => {
      const versionId = identifierSchema.safeParse(context.req.param("id"));
      const input = zEmptyObject.safeParse(await safeJson(context));
      if (!versionId.success || !input.success) return context.json({ error: "invalid_version_retire_data" }, 400);
      try {
        const version = await adminGateway.retireVersion(context.get("user").id, randomUUID(), versionId.data);
        return context.json({ version });
      } catch (error) { return adminErrorResponse(context, error); }
    },
  );

  app.get("/api/admin/versions/:id/prices", requireStaff(sessions, adminGateway, ["catalog:read"]), async (context) => {
    const versionId = identifierSchema.safeParse(context.req.param("id"));
    const page = paginationSchema.safeParse(context.req.query());
    if (!versionId.success || !page.success) return context.json({ error: "invalid_price_query" }, 400);
    try {
      const result = await adminGateway.listPrices(versionId.data, page.data);
      return context.json({ ...result, ...page.data });
    } catch (error) { return adminErrorResponse(context, error); }
  });

  app.post(
    "/api/admin/versions/:id/prices", protectMutation(environment),
    requireStaff(sessions, adminGateway, ["catalog:write"]), async (context) => {
      const versionId = identifierSchema.safeParse(context.req.param("id"));
      const input = priceInputSchema.safeParse(await safeJson(context));
      if (!versionId.success || !input.success) return context.json({ error: "invalid_price_data" }, 400);
      try {
        const price = await adminGateway.createPrice(context.get("user").id, randomUUID(), versionId.data, input.data);
        return context.json({ price }, 201);
      } catch (error) { return adminErrorResponse(context, error); }
    },
  );

  app.get("/api/admin/prices/:id", requireStaff(sessions, adminGateway, ["catalog:read"]), async (context) => {
    const priceId = identifierSchema.safeParse(context.req.param("id"));
    if (!priceId.success) return context.json({ error: "invalid_price_id" }, 400);
    try {
      const price = await adminGateway.getPrice(priceId.data);
      return price ? context.json({ price }) : context.json({ error: "price_not_found" }, 404);
    } catch (error) { return adminErrorResponse(context, error); }
  });

  for (const action of ["activate", "retire"] as const) {
    app.post(
      `/api/admin/prices/:id/${action}`, protectMutation(environment),
      requireStaff(sessions, adminGateway, ["catalog:write"]), async (context) => {
        const priceId = identifierSchema.safeParse(context.req.param("id"));
        const input = zEmptyObject.safeParse(await safeJson(context));
        if (!priceId.success || !input.success) return context.json({ error: `invalid_price_${action}_data` }, 400);
        try {
          const method = action === "activate" ? adminGateway.activatePrice : adminGateway.retirePrice;
          const price = await method(context.get("user").id, randomUUID(), priceId.data);
          return context.json({ price });
        } catch (error) { return adminErrorResponse(context, error); }
      },
    );
  }

  app.get("/api/admin/products/:id/media",requireStaff(sessions,adminGateway,["catalog:read"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),p=paginationSchema.safeParse(c.req.query());if(!id.success||!p.success)return c.json({error:"invalid_media_query"},400);try{return c.json({...await adminGateway.listMedia(id.data,p.data),...p.data});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/products/:id/media",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),i=mediaInputSchema.safeParse(await safeJson(c));if(!id.success||!i.success)return c.json({error:"invalid_media_data"},400);try{return c.json({media:await adminGateway.createMedia(c.get("user").id,randomUUID(),id.data,i.data)},201);}catch(e){return adminErrorResponse(c,e);}});
  app.patch("/api/admin/media/:id",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),i=mediaUpdateSchema.safeParse(await safeJson(c));if(!id.success||!i.success)return c.json({error:"invalid_media_data"},400);try{return c.json({media:await adminGateway.updateMedia(c.get("user").id,randomUUID(),id.data,i.data)});}catch(e){return adminErrorResponse(c,e);}});
  for(const action of ["cover","deactivate"] as const)app.post(`/api/admin/media/:id/${action}`,protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),i=zEmptyObject.safeParse(await safeJson(c));if(!id.success||!i.success)return c.json({error:`invalid_media_${action}_data`},400);try{const method=action==="cover"?adminGateway.setCover:adminGateway.deactivateMedia;return c.json({media:await method(c.get("user").id,randomUUID(),id.data)});}catch(e){return adminErrorResponse(c,e);}});
  app.get("/api/admin/versions/:id/files",requireStaff(sessions,adminGateway,["catalog:read"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),p=paginationSchema.safeParse(c.req.query());if(!id.success||!p.success)return c.json({error:"invalid_file_query"},400);try{return c.json({...await adminGateway.listFiles(id.data,p.data),...p.data});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/versions/:id/files",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),i=fileInputSchema.safeParse(await safeJson(c));if(!id.success||!i.success)return c.json({error:"invalid_file_data"},400);try{return c.json({file:await adminGateway.createFile(c.get("user").id,randomUUID(),id.data,i.data)},201);}catch(e){return adminErrorResponse(c,e);}});
  app.get("/api/admin/files/:id",requireStaff(sessions,adminGateway,["catalog:read"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id"));if(!id.success)return c.json({error:"invalid_file_id"},400);try{const file=await adminGateway.getFile(id.data);return file?c.json({file}):c.json({error:"file_not_found"},404);}catch(e){return adminErrorResponse(c,e);}});
  app.patch("/api/admin/files/:id",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),i=fileUpdateSchema.safeParse(await safeJson(c));if(!id.success||!i.success)return c.json({error:"invalid_file_data"},400);try{return c.json({file:await adminGateway.updateFile(c.get("user").id,randomUUID(),id.data,i.data)});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/files/:id/retire",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),i=zEmptyObject.safeParse(await safeJson(c));if(!id.success||!i.success)return c.json({error:"invalid_file_retire_data"},400);try{return c.json({file:await adminGateway.retireFile(c.get("user").id,randomUUID(),id.data)});}catch(e){return adminErrorResponse(c,e);}});
  app.get("/api/admin/products/:id/readiness",requireStaff(sessions,adminGateway,["catalog:read"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id"));if(!id.success)return c.json({error:"invalid_product_id"},400);try{return c.json({readiness:await adminGateway.getPublicationReadiness(c.get("user").id,id.data)});}catch(e){return adminErrorResponse(c,e);}});

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
    try {
      const hasPassword = await gateway.hasPassword(session.accessToken, session.user.id);
      return context.json({
        emailConfirmed: Boolean(session.user.emailConfirmed),
        methods: {
          password: hasPassword,
          google: session.user.providers?.includes("google") ?? false,
        },
        actions: {
          canSetupPassword: Boolean(session.user.emailConfirmed)
            && !hasPassword
            && (session.user.providers?.includes("google") ?? false),
        },
      });
    } catch {
      return context.json({ error: "access_methods_unavailable" }, 503);
    }
  });

  app.post("/api/auth/password/setup/request", protectMutation(environment), async (context) => {
    const session = await sessions.resolve(context);
    if (!session?.refreshToken) return context.json({ error: "authentication_required" }, 401);
    if (!session.user.emailConfirmed || !session.user.providers?.includes("google")) {
      return context.json({ error: "password_setup_not_eligible" }, 409);
    }
    const rates = [
      passwordSetupGlobalLimiter.consume("password-setup-global"),
      passwordSetupLimiter.consume(`request:${session.user.id}`),
    ];
    const denied = rates.find((rate) => !rate.allowed);
    if (denied) {
      context.header("Retry-After", String(denied.retryAfter));
      return context.json({ error: "too_many_requests" }, 429);
    }
    try {
      if (await gateway.hasPassword(session.accessToken, session.user.id)) {
        return context.json({ error: "password_already_configured" }, 409);
      }
      const requested = await gateway.requestPasswordSetup({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: 60,
        user: session.user,
      }, session.user.id);
      if (!requested) return context.json({ error: "password_setup_session_invalid" }, 401);
      return context.json({ status: "password_setup_code_sent" }, 202);
    } catch {
      return context.json({ error: "password_setup_temporarily_unavailable" }, 503);
    }
  });

  app.post("/api/auth/password/setup/confirm", protectMutation(environment), async (context) => {
    const session = await sessions.resolve(context);
    if (!session?.refreshToken) return context.json({ error: "authentication_required" }, 401);
    if (!session.user.emailConfirmed || !session.user.providers?.includes("google")) {
      return context.json({ error: "password_setup_not_eligible" }, 409);
    }
    const input = passwordSetupSchema.safeParse(await safeJson(context));
    if (!input.success) return context.json({ error: "invalid_password_setup_data" }, 400);
    const rate = passwordSetupLimiter.consume(`confirm:${session.user.id}`);
    if (!rate.allowed) {
      context.header("Retry-After", String(rate.retryAfter));
      return context.json({ error: "too_many_requests" }, 429);
    }
    try {
      if (await gateway.hasPassword(session.accessToken, session.user.id)) {
        return context.json({ error: "password_already_configured" }, 409);
      }
      const result = await gateway.setupPasswordWithOtp({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: 60,
        user: session.user,
      }, session.user.id, input.data.token, input.data.password);
      if (result !== "updated") return context.json({ error: "password_setup_invalid_or_expired" }, 400);
      sessions.clear(context);
      return context.json({ status: "password_configured", authenticated: false });
    } catch {
      sessions.clear(context);
      return context.json({ error: "password_setup_temporarily_unavailable" }, 503);
    }
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

  app.patch("/api/profile", protectMutation(environment), async (context) => {
    const session = await sessions.resolve(context);
    if (!session) return context.json({ error: "authentication_required" }, 401);
    const input = profileUpdateSchema.safeParse(await safeJson(context));
    if (!input.success) return context.json({ error: "invalid_profile_data" }, 400);

    try {
      const profile = await gateway.updateOwnProfile(session.accessToken, session.user.id, input.data.displayName);
      if (!profile) return context.json({ error: "profile_not_found" }, 404);
      return context.json({ profile });
    } catch {
      return context.json({ error: "profile_update_unavailable" }, 503);
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

function adminErrorResponse(context: Context, error: unknown) {
  const code = error instanceof AdminOperationError ? error.databaseCode : undefined;
  if (code === "23505") return context.json({ error: "admin_conflict" }, 409);
  if (["23503", "23514", "55000"].includes(code ?? "")) {
    return context.json({ error: "admin_state_conflict" }, 409);
  }
  if (code === "P0002") return context.json({ error: "admin_resource_not_found" }, 404);
  if (code === "42501") return context.json({ error: "admin_access_denied" }, 403);
  return context.json({ error: "admin_operation_unavailable" }, 503);
}
