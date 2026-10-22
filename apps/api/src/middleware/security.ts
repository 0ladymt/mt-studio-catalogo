import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { ApiEnvironment } from "../config/env.js";
import { allowedOrigins } from "../config/env.js";
import { validCsrf } from "../auth/cookies.js";

export function restrictedCors(environment: ApiEnvironment): MiddlewareHandler {
  const origins = allowedOrigins(environment);
  return cors({
    origin: (origin) => origins.has(origin) ? origin : undefined,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-CSRF-Token", "Authorization"],
    credentials: true,
    maxAge: 600,
  });
}

export function protectMutation(environment: ApiEnvironment): MiddlewareHandler {
  const origins = allowedOrigins(environment);
  return async (context, next) => {
    const origin = context.req.header("origin");
    if (!origin || !origins.has(origin)) return context.json({ error: "origin_not_allowed" }, 403);
    if (!validCsrf(context)) return context.json({ error: "csrf_validation_failed" }, 403);
    await next();
  };
}
