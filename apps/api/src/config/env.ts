import { z } from "zod";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

const environmentSchema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  ALLOWED_ORIGINS: z.string().default("http://127.0.0.1:4173,http://localhost:4173"),
  SESSION_REFRESH_MAX_AGE: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  GOOGLE_OAUTH_CALLBACK_URL: z.string().url().default("http://127.0.0.1:8787/api/auth/google/callback"),
  GOOGLE_IDENTITY_LINK_CALLBACK_URL: z.string().url().default("http://127.0.0.1:8787/api/auth/google/link/callback"),
  OAUTH_TRANSACTION_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(600),
  SENSITIVE_AUTHORIZATION_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  PUBLIC_SITE_URL: z.string().url().default("http://127.0.0.1:4173"),
  PAYMENT_PROVIDER: z.enum(["disabled","mock","mercado_pago"]).optional(),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().min(20).optional(),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().min(16).optional(),
  MERCADO_PAGO_API_URL: z.string().url().optional(),
  MERCADO_PAGO_NOTIFICATION_URL: z.string().url().optional(),
  PIX_EXPIRATION_MINUTES: z.coerce.number().int().min(5).max(1440).optional(),
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).optional(),
  EMAIL_PROVIDER: z.enum(["disabled", "mock", "smtp", "brevo_api"]).optional(),
  EMAIL_BATCH_SIZE: z.coerce.number().int().min(1).max(20).optional(),
  BREVO_API_KEY: z.string().min(20).optional(),
  BREVO_API_URL: z.string().url().optional(),
  BREVO_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),
  SMTP_FROM_NAME: z.string().min(1).max(120).optional(),
  SMTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).optional(),
});

export type ApiEnvironment = z.infer<typeof environmentSchema>;

export function loadPrivateEnvironmentFile(path = ".env.local"): void {
  if (existsSync(path)) loadEnvFile(path);
}

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  return environmentSchema.parse(source);
}

export function allowedOrigins(environment: ApiEnvironment): Set<string> {
  return new Set(
    environment.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}
