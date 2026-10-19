import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { readEnvironment } from "./config/env.js";
import { createSupabaseAuthGateway } from "./services/supabase.js";
import { createAdminSupabaseGateway } from "./services/admin-supabase.js";

const environment = readEnvironment();
const app = createApp(
  createSupabaseAuthGateway(environment),
  environment,
  createAdminSupabaseGateway(environment),
);

serve({
  fetch: app.fetch,
  hostname: environment.API_HOST,
  port: environment.API_PORT,
});

console.info(`MT Studio API listening on http://${environment.API_HOST}:${environment.API_PORT}`);
