import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadPrivateEnvironmentFile, readEnvironment } from "./config/env.js";
import { createSupabaseAuthGateway } from "./services/supabase.js";
import { createAdminSupabaseGateway } from "./services/admin-supabase.js";
import { createStorageUploadSupabaseGateway } from "./services/storage-upload-supabase.js";
import { unavailableObjectStorage } from "./storage/object-storage.js";
import { createConfiguredObjectStorage } from "./storage/r2-s3-storage.js";
import { createVerifierAuthorizationGateway } from "./services/verifier-authorization-supabase.js";
import { createMultipartUploadGateway } from "./services/multipart-upload-supabase.js";

loadPrivateEnvironmentFile();
const environment = readEnvironment();
const app = createApp(
  createSupabaseAuthGateway(environment),
  environment,
  createAdminSupabaseGateway(environment),
  createConfiguredObjectStorage(process.env) ?? unavailableObjectStorage(),
  createStorageUploadSupabaseGateway(environment),
  createVerifierAuthorizationGateway(environment),
  createMultipartUploadGateway(environment),
);

serve({
  fetch: app.fetch,
  hostname: environment.API_HOST,
  port: environment.API_PORT,
});

console.info(`MT Studio API listening on http://${environment.API_HOST}:${environment.API_PORT}`);
