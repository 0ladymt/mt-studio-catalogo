import { z } from "zod";

const environmentSchema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  ALLOWED_ORIGINS: z.string().default("http://127.0.0.1:4173,http://localhost:4173"),
  SESSION_REFRESH_MAX_AGE: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
});

export type ApiEnvironment = z.infer<typeof environmentSchema>;

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
