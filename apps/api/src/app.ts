import { Hono, type Context } from "hono";
import { z } from "zod";
import { authenticate, type AuthVariables } from "./middleware/authenticate.js";
import type { AuthGateway } from "./types/auth.js";
import type { ApiEnvironment } from "./config/env.js";
import { SessionManager } from "./auth/session.js";
import { protectMutation, restrictedCors } from "./middleware/security.js";
import { issueCsrfCookie, validCsrf } from "./auth/cookies.js";
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
import { categoryInputSchema, fileInputSchema, fileUpdateSchema, identifierSchema, mediaInputSchema, mediaUpdateSchema, paginationSchema, priceInputSchema, productInputSchema, productListQuerySchema, publishProductSchema, storageUploadRequestSchema, unpublishProductSchema, versionInputSchema } from "./admin/validation.js";
import type { ObjectStorage } from "./types/storage.js";
import type { MultipartUploadGateway, StorageUploadGateway, StorageVerificationGateway } from "./types/storage.js";
import { unavailableObjectStorage, StorageUnavailableError } from "./storage/object-storage.js";
import { unavailableStorageUploadGateway } from "./services/storage-upload-supabase.js";
import type { VerifierAuthorizationGateway } from "./types/verifier-authorization.js";
import { unavailableVerifierAuthorizationGateway } from "./services/verifier-authorization-supabase.js";
import { unavailableMultipartUploadGateway } from "./services/multipart-upload-supabase.js";
import { unavailableStorageVerificationGateway } from "./services/storage-verification-supabase.js";

const OAUTH_TRANSACTION_COOKIE = "mt_oauth_tx";
const GOOGLE_LINK_TRANSACTION_COOKIE = "mt_google_link_tx";
const SENSITIVE_AUTHORIZATION_COOKIE = "mt_sensitive_auth";
const zEmptyObject = z.object({}).strict();

export function createApp(
  gateway: AuthGateway,
  environment: ApiEnvironment,
  adminGateway: AdminGateway = unavailableAdminGateway(),
  objectStorage: ObjectStorage = unavailableObjectStorage(),
  storageUploads: StorageUploadGateway = unavailableStorageUploadGateway(),
  verifierAuthorizations: VerifierAuthorizationGateway = unavailableVerifierAuthorizationGateway(),
  multipartUploads: MultipartUploadGateway = unavailableMultipartUploadGateway(),
  verificationJobs: StorageVerificationGateway = unavailableStorageVerificationGateway(),
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
  const localVerifierLimiter = new FixedWindowRateLimiter(20, 5 * 60 * 1000);
  const verifierRequestSchema=z.object({uploadId:identifierSchema,secretHash:z.string().regex(/^[0-9a-f]{64}$/)}).strict();
  const verifierConsumeSchema=z.object({secret:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
  const localApiOrigin=`http://${environment.API_HOST}:${environment.API_PORT}`;

  app.use("/api/*", restrictedCors(environment));

  app.put("/api/storage-local/multipart/:uploadId/:partNumber", async context => {
    if (!['development','test'].includes(environment.APP_ENV) || !objectStorage.handleLocalMultipartRequest) return context.json({ error: "local_storage_unavailable" }, 404);
    return objectStorage.handleLocalMultipartRequest(context.req.raw);
  });

  app.get("/api/health", (context) => context.json({ status: "ok" }));

  app.post("/api/local-verifier/authorizations",async c=>{
    if(!["development","test"].includes(environment.APP_ENV)||c.req.header("origin")||c.req.header("x-mt-studio-cli")!=="1")return c.json({error:"local_verifier_unavailable"},403);
    const rate=localVerifierLimiter.consume("create");if(!rate.allowed)return c.json({error:"too_many_requests"},429);
    const input=verifierRequestSchema.safeParse(await safeJson(c));if(!input.success)return c.json({error:"invalid_verifier_authorization"},400);
    try{const authorization=await verifierAuthorizations.create(input.data.uploadId,input.data.secretHash,new Date(Date.now()+3*60*1000).toISOString());return c.json({authorization:{id:authorization.id,status:authorization.status,expiresAt:authorization.expiresAt,approvalUrl:`${localApiOrigin}/api/admin/verifier-authorizations/${authorization.id}/consent`}},201);}catch(e){return adminErrorResponse(c,e);}
  });
  app.post("/api/local-verifier/authorizations/:id/consume",async c=>{
    if(!["development","test"].includes(environment.APP_ENV)||c.req.header("origin")||c.req.header("x-mt-studio-cli")!=="1")return c.json({error:"local_verifier_unavailable"},403);
    const rate=localVerifierLimiter.consume("consume");if(!rate.allowed)return c.json({error:"too_many_requests"},429);
    const id=identifierSchema.safeParse(c.req.param("id")),input=verifierConsumeSchema.safeParse(await safeJson(c));if(!id.success||!input.success)return c.json({error:"invalid_verifier_authorization"},400);
    try{const secretHash=(await import("node:crypto")).createHash("sha256").update(input.data.secret).digest("hex"),authorization=await verifierAuthorizations.consume(id.data,secretHash);if(authorization.status!=="consumed"||!authorization.approvedBy)return c.json({authorization:{status:authorization.status,expiresAt:authorization.expiresAt}},409);return c.json({authorization:{status:"consumed",actorUserId:authorization.approvedBy,uploadId:authorization.storageUploadId}});}catch{return c.json({error:"verifier_authorization_denied"},403);}
  });
  app.get("/api/admin/verifier-authorizations/:id/consent",requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{
    const id=identifierSchema.safeParse(c.req.param("id"));if(!id.success)return c.text("Solicitação inválida.",400);
    const authorization=await verifierAuthorizations.get(id.data);if(!authorization)return c.text("Solicitação não encontrada.",404);
    const upload=await storageUploads.getUpload(authorization.storageUploadId),file=upload?await adminGateway.getFile(upload.productFileId):null;if(!upload||!file)return c.text("Upload não encontrado.",404);
    const safeId=authorization.id,fileName=escapeHtml(file.displayName),fileSize=new Intl.NumberFormat("pt-BR").format(file.sizeBytes);
    return c.html(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Autorizar verificação — MT STUDIO</title><style>body{margin:0;background:#111;color:#eee;font:16px Arial;display:grid;place-items:center;min-height:100vh}.box{max-width:34rem;padding:2rem;border:1px solid #444}.detail{padding:1rem 0;border-block:1px solid #333}button{min-height:44px;background:#a432dc;color:#fff;border:0;padding:.75rem 1rem;margin:.25rem}.secondary{background:#333}p{line-height:1.5}</style><main class="box"><h1>Autorizar verificação local</h1><p>Confirme uma única verificação integral antes de permitir qualquer mudança para <strong>verified</strong>.</p><div class="detail"><strong>${fileName}</strong><br><span>${fileSize} bytes · SHA-256 integral · upload específico</span></div><p>A permissão expira em poucos minutos e não concede acesso a outros arquivos.</p><button id="approve">Autorizar esta verificação</button><button id="decline" class="secondary">Recusar</button><p id="status" role="status"></p></main><script>const act=async(action)=>{const s=document.querySelector('#status');document.querySelectorAll('button').forEach(b=>b.disabled=true);try{const c=await fetch('/api/auth/csrf',{credentials:'include'}).then(r=>r.json());const r=await fetch('/api/admin/verifier-authorizations/${safeId}/'+action,{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':c.csrfToken},body:'{}'});s.textContent=r.ok?(action==='approve'?'Autorização concluída. Você pode fechar esta janela.':'Solicitação recusada. Você pode fechar esta janela.'):'Não foi possível concluir a operação.';}catch{s.textContent='Não foi possível concluir a operação.';}};document.querySelector('#approve').onclick=()=>act('approve');document.querySelector('#decline').onclick=()=>act('decline');</script></html>`);
  });
  app.post("/api/admin/verifier-authorizations/:id/approve",async(c,next)=>{if(c.req.header("origin")!==localApiOrigin||!validCsrf(c))return c.json({error:"verifier_consent_rejected"},403);await next();},requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),input=zEmptyObject.safeParse(await safeJson(c));if(!id.success||!input.success)return c.json({error:"invalid_verifier_authorization"},400);try{const a=await verifierAuthorizations.approve(c.get("user").id,randomUUID(),id.data);return c.json({authorization:{id:a.id,status:a.status,expiresAt:a.expiresAt}});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/verifier-authorizations/:id/decline",async(c,next)=>{if(c.req.header("origin")!==localApiOrigin||!validCsrf(c))return c.json({error:"verifier_consent_rejected"},403);await next();},requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),input=zEmptyObject.safeParse(await safeJson(c));if(!id.success||!input.success)return c.json({error:"invalid_verifier_authorization"},400);try{const a=await verifierAuthorizations.revoke(c.get("user").id,randomUUID(),id.data);return c.json({authorization:{id:a.id,status:a.status}});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/verifier-authorizations/:id/revoke",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),input=zEmptyObject.safeParse(await safeJson(c));if(!id.success||!input.success)return c.json({error:"invalid_verifier_authorization"},400);try{const a=await verifierAuthorizations.revoke(c.get("user").id,randomUUID(),id.data);return c.json({authorization:{id:a.id,status:a.status}});}catch(e){return adminErrorResponse(c,e);}});

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
  app.post("/api/admin/files/:id/uploads",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{
    const fileId=identifierSchema.safeParse(c.req.param("id")),input=storageUploadRequestSchema.safeParse(await safeJson(c));
    if(!fileId.success||!input.success)return c.json({error:"invalid_storage_upload_data"},400);
    try{
      const file=await adminGateway.getFile(fileId.data);
      if(!file)return c.json({error:"file_not_found"},404);
      const expiresAt=new Date(Date.now()+24*60*60*1000);
      const upload=await storageUploads.beginUpload(c.get("user").id,input.data.requestId,file.id,expiresAt.toISOString());
      if(upload.status!=="initiated"||new Date(upload.expiresAt).getTime()<=Date.now())return c.json({error:"storage_upload_expired"},409);
      if(input.data.mode==="multipart")return c.json({upload:{id:upload.id,status:upload.status,expiresAt:upload.expiresAt}},201);
      const signed=await objectStorage.createPresignedPut({objectKey:upload.objectKey,contentType:file.mimeType,sizeBytes:file.sizeBytes,expiresAt:new Date(upload.expiresAt)});
      return c.json({upload:{id:upload.id,status:upload.status,method:signed.method,url:signed.url,headers:signed.headers,expiresAt:signed.expiresAt}},201);
    }catch(e){if(e instanceof StorageUnavailableError)return c.json({error:"object_storage_unavailable"},503);return adminErrorResponse(c,e);}
  });
  app.post("/api/admin/storage-uploads/:id/confirm",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{
    const uploadId=identifierSchema.safeParse(c.req.param("id")),input=storageUploadRequestSchema.safeParse(await safeJson(c));
    if(!uploadId.success||!input.success)return c.json({error:"invalid_storage_confirmation_data"},400);
    try{
      const upload=await storageUploads.getUpload(uploadId.data);
      if(!upload)return c.json({error:"storage_upload_not_found"},404);
      const inspection=await objectStorage.inspectObject(upload.objectKey, {
        sizeBytes: upload.expectedSizeBytes,
        checksumSha256: upload.expectedChecksumSha256,
      });
      const result=await storageUploads.confirmUpload(c.get("user").id,input.data.requestId,upload.id,inspection);
      return c.json({upload:{id:result.id,status:result.status,failureCode:result.failureCode},fileStorageStatus:result.status==="verified"?"verified":"metadata_only"});
    }catch(e){if(e instanceof StorageUnavailableError)return c.json({error:"object_storage_unavailable"},503);return adminErrorResponse(c,e);}
  });
  const multipartStartSchema=z.object({requestId:identifierSchema,partSizeBytes:z.number().int().min(5*1024*1024).max(128*1024*1024).default(8*1024*1024)}).strict(),multipartPartSchema=z.object({partNumber:z.number().int().min(1).max(10000)}).strict(),multipartMutationSchema=z.object({requestId:identifierSchema}).strict();
  app.post("/api/admin/storage-uploads/:id/multipart",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),input=multipartStartSchema.safeParse(await safeJson(c));if(!id.success||!input.success)return c.json({error:"invalid_multipart_data"},400);try{const upload=await storageUploads.getUpload(id.data);if(!upload)return c.json({error:"storage_upload_not_found"},404);if(!objectStorage.beginMultipart)return c.json({error:"multipart_storage_unavailable"},503);const provider=await objectStorage.beginMultipart({objectKey:upload.objectKey,contentType:"application/octet-stream"});try{const session=await multipartUploads.begin(c.get("user").id,input.data.requestId,upload.id,provider.providerUploadId,input.data.partSizeBytes);if(session.providerUploadId!==provider.providerUploadId)await objectStorage.abortMultipart?.({objectKey:upload.objectKey,providerUploadId:provider.providerUploadId});return c.json({multipart:{id:session.id,status:session.status,partSizeBytes:session.partSizeBytes,totalParts:session.totalParts,expiresAt:session.expiresAt}},201);}catch(error){await objectStorage.abortMultipart?.({objectKey:upload.objectKey,providerUploadId:provider.providerUploadId});throw error;}}catch(e){return adminErrorResponse(c,e);}});
  app.get("/api/admin/multipart/:id",requireStaff(sessions,adminGateway,["catalog:read"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id"));if(!id.success)return c.json({error:"invalid_multipart_id"},400);try{const session=await multipartUploads.get(id.data);if(!session)return c.json({error:"multipart_not_found"},404);if(session.initiatedBy!==c.get("user").id)return c.json({error:"admin_access_denied"},403);return c.json({multipart:{id:session.id,status:session.status,partSizeBytes:session.partSizeBytes,totalParts:session.totalParts,expiresAt:session.expiresAt,parts:await multipartUploads.listParts(session.id)}});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/multipart/:id/reconcile",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),empty=zEmptyObject.safeParse(await safeJson(c));if(!id.success||!empty.success)return c.json({error:"invalid_multipart_reconciliation"},400);try{const session=await multipartUploads.get(id.data);if(!session||session.initiatedBy!==c.get("user").id)return c.json({error:"multipart_not_found"},404);if(!["initiated","uploading"].includes(session.status))return c.json({error:"multipart_session_unavailable"},409);const upload=await storageUploads.getUpload(session.storageUploadId);if(!upload||!objectStorage.listMultipartParts)return c.json({error:"multipart_storage_unavailable"},503);const recorded=await multipartUploads.listParts(session.id),trusted=await objectStorage.listMultipartParts({objectKey:upload.objectKey,providerUploadId:session.providerUploadId});for(const part of trusted){const prior=recorded.find(item=>item.partNumber===part.partNumber);if(prior&&(prior.providerEtag!==part.etag||prior.sizeBytes!==part.sizeBytes))return c.json({error:"multipart_part_changed"},409);if(!prior)await multipartUploads.recordPart(c.get("user").id,session.id,{partNumber:part.partNumber,sizeBytes:part.sizeBytes,providerEtag:part.etag});}const parts=await multipartUploads.listParts(session.id);return c.json({multipart:{id:session.id,status:parts.length?"uploading":session.status,partSizeBytes:session.partSizeBytes,totalParts:session.totalParts,expiresAt:session.expiresAt,parts}});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/multipart/:id/part-url",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),input=multipartPartSchema.safeParse(await safeJson(c));if(!id.success||!input.success)return c.json({error:"invalid_multipart_part"},400);try{const session=await multipartUploads.get(id.data);if(!session||session.initiatedBy!==c.get("user").id)return c.json({error:"multipart_not_found"},404);if(!["initiated","uploading"].includes(session.status)||new Date(session.expiresAt).getTime()<=Date.now())return c.json({error:"multipart_session_unavailable"},409);if((await multipartUploads.listParts(session.id)).some(part=>part.partNumber===input.data.partNumber))return c.json({error:"multipart_part_already_confirmed"},409);const upload=await storageUploads.getUpload(session.storageUploadId);if(!upload||!objectStorage.createMultipartPartUrl)return c.json({error:"multipart_storage_unavailable"},503);const size=input.data.partNumber<session.totalParts?session.partSizeBytes:upload.expectedSizeBytes-(session.totalParts-1)*session.partSizeBytes,signed=await objectStorage.createMultipartPartUrl({objectKey:upload.objectKey,providerUploadId:session.providerUploadId,partNumber:input.data.partNumber,sizeBytes:size,expiresAt:new Date(Math.min(Date.now()+5*60_000,new Date(session.expiresAt).getTime()))});return c.json({part:{partNumber:input.data.partNumber,sizeBytes:size,...signed}});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/multipart/:id/parts/:partNumber/confirm",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),partNumber=z.coerce.number().int().min(1).max(10000).safeParse(c.req.param("partNumber")),empty=zEmptyObject.safeParse(await safeJson(c));if(!id.success||!partNumber.success||!empty.success)return c.json({error:"invalid_multipart_part"},400);try{const session=await multipartUploads.get(id.data);if(!session||session.initiatedBy!==c.get("user").id)return c.json({error:"multipart_not_found"},404);const upload=await storageUploads.getUpload(session.storageUploadId);if(!upload||!objectStorage.listMultipartParts)return c.json({error:"multipart_storage_unavailable"},503);const trusted=(await objectStorage.listMultipartParts({objectKey:upload.objectKey,providerUploadId:session.providerUploadId})).find(p=>p.partNumber===partNumber.data);if(!trusted)return c.json({error:"multipart_part_not_found"},409);return c.json({part:await multipartUploads.recordPart(c.get("user").id,session.id,{partNumber:trusted.partNumber,sizeBytes:trusted.sizeBytes,providerEtag:trusted.etag})});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/multipart/:id/complete",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),input=multipartMutationSchema.safeParse(await safeJson(c));if(!id.success||!input.success)return c.json({error:"invalid_multipart_completion"},400);try{const session=await multipartUploads.get(id.data);if(!session||session.initiatedBy!==c.get("user").id)return c.json({error:"multipart_not_found"},404);if(session.status==="completed")return c.json({multipart:{id:session.id,status:session.status},fileStorageStatus:"metadata_only"});const upload=await storageUploads.getUpload(session.storageUploadId),parts=await multipartUploads.listParts(session.id);if(!upload||!objectStorage.listMultipartParts||!objectStorage.completeMultipart)return c.json({error:"multipart_storage_unavailable"},503);const stagingMatches=async()=>{if(!objectStorage.inspectStagingObject)return false;const staging=await objectStorage.inspectStagingObject(upload.objectKey);return staging.exists&&staging.integrity==="trusted_full_object"&&staging.sizeBytes===upload.expectedSizeBytes&&staging.checksumSha256===upload.expectedChecksumSha256;},trusted=await objectStorage.listMultipartParts({objectKey:upload.objectKey,providerUploadId:session.providerUploadId});if(trusted.length===0&&parts.length===session.totalParts){if(!await stagingMatches())return c.json({error:"multipart_parts_incomplete"},409);}else{if(trusted.length!==session.totalParts||parts.length!==trusted.length||parts.some((p,i)=>p.partNumber!==trusted[i]?.partNumber||p.providerEtag!==trusted[i]?.etag||p.sizeBytes!==trusted[i]?.sizeBytes))return c.json({error:"multipart_parts_incomplete"},409);try{await objectStorage.completeMultipart({objectKey:upload.objectKey,providerUploadId:session.providerUploadId,parts:trusted.map(({partNumber,etag})=>({partNumber,etag}))});}catch(error){if(!await stagingMatches())throw error;}}const completed=await multipartUploads.complete(c.get("user").id,input.data.requestId,session.id);return c.json({multipart:{id:completed.id,status:completed.status},fileStorageStatus:"metadata_only"});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/multipart/:id/cancel",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),input=multipartMutationSchema.safeParse(await safeJson(c));if(!id.success||!input.success)return c.json({error:"invalid_multipart_cancel"},400);try{const session=await multipartUploads.get(id.data);if(!session||session.initiatedBy!==c.get("user").id)return c.json({error:"multipart_not_found"},404);const upload=await storageUploads.getUpload(session.storageUploadId);if(!upload||!objectStorage.abortMultipart)return c.json({error:"multipart_storage_unavailable"},503);await objectStorage.abortMultipart({objectKey:upload.objectKey,providerUploadId:session.providerUploadId});const cancelled=await multipartUploads.cancel(c.get("user").id,input.data.requestId,session.id);return c.json({multipart:{id:cancelled.id,status:cancelled.status}});}catch(e){return adminErrorResponse(c,e);}});
  app.get("/api/admin/files/:id/verification",requireStaff(sessions,adminGateway,["catalog:read"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id"));if(!id.success)return c.json({error:"invalid_file_id"},400);try{const file=await adminGateway.getFile(id.data);if(!file)return c.json({error:"file_not_found"},404);if(!storageUploads.getLatestForFile||!multipartUploads.getByUpload)return c.json({error:"verification_status_unavailable"},503);const upload=await storageUploads.getLatestForFile(file.id);if(!upload)return c.json({verification:{fileStorageStatus:file.storageStatus,upload:null,job:null}});const session=await multipartUploads.getByUpload(upload.id),job=await verificationJobs.getByUpload(upload.id);return c.json({verification:{fileStorageStatus:file.storageStatus,upload:{id:upload.id,status:upload.status},multipartStatus:session?.status??null,job:job?{id:job.id,status:job.status,attempts:job.attempts,failureCode:job.failureCode}:null}});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/storage-uploads/:id/verification-jobs",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:write"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),input=multipartMutationSchema.safeParse(await safeJson(c));if(!id.success||!input.success)return c.json({error:"invalid_verification_request"},400);try{const upload=await storageUploads.getUpload(id.data);if(!upload)return c.json({error:"storage_upload_not_found"},404);if(!multipartUploads.getByUpload)return c.json({error:"verification_status_unavailable"},503);const session=await multipartUploads.getByUpload(upload.id);if(!session||session.status!=="completed")return c.json({error:"multipart_not_completed"},409);const job=await verificationJobs.create(c.get("user").id,upload.id,input.data.requestId);return c.json({verification:{uploadId:upload.id,job:{id:job.id,status:job.status,attempts:job.attempts,failureCode:job.failureCode}}},201);}catch(e){return adminErrorResponse(c,e);}});
  app.get("/api/admin/products/:id/readiness",requireStaff(sessions,adminGateway,["catalog:read"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id"));if(!id.success)return c.json({error:"invalid_product_id"},400);try{return c.json({readiness:await adminGateway.getPublicationReadiness(c.get("user").id,id.data)});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/products/:id/publish",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:publish"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),i=publishProductSchema.safeParse(await safeJson(c));if(!id.success||!i.success)return c.json({error:"invalid_product_publication"},400);try{return c.json({product:await adminGateway.publishProduct(c.get("user").id,i.data.requestId,id.data,i.data.versionId)});}catch(e){return adminErrorResponse(c,e);}});
  app.post("/api/admin/products/:id/unpublish",protectMutation(environment),requireStaff(sessions,adminGateway,["catalog:publish"]),async c=>{const id=identifierSchema.safeParse(c.req.param("id")),i=unpublishProductSchema.safeParse(await safeJson(c));if(!id.success||!i.success)return c.json({error:"invalid_product_unpublication"},400);try{return c.json({product:await adminGateway.unpublishProduct(c.get("user").id,i.data.requestId,id.data,i.data.reason)});}catch(e){return adminErrorResponse(c,e);}});

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

function escapeHtml(value:string):string{return value.replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]!);}

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
