import { z } from "zod";

const normalizedEmail = z.string()
  .trim()
  .toLowerCase()
  .max(254)
  .email();

export const signupSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: normalizedEmail,
  password: z.string()
    .min(12)
    .max(128)
    .regex(/[a-z]/, "lowercase_required")
    .regex(/[A-Z]/, "uppercase_required")
    .regex(/[0-9]/, "number_required")
    .regex(/[^A-Za-z0-9]/, "symbol_required"),
}).strict();

export const emailSchema = z.object({ email: normalizedEmail }).strict();

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1).max(128),
}).strict();

export const confirmationSchema = z.object({
  email: normalizedEmail,
  token: z.string().trim().regex(/^\d{6}$/),
}).strict();
