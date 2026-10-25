import { z } from "zod";

const normalizedEmail = z.string()
  .trim()
  .toLowerCase()
  .max(254)
  .email();

export const strongPassword = z.string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, "lowercase_required")
  .regex(/[A-Z]/, "uppercase_required")
  .regex(/[0-9]/, "number_required")
  .regex(/[^A-Za-z0-9]/, "symbol_required");

export const signupSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: normalizedEmail,
  password: strongPassword,
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

export const passwordResetSchema = z.object({
  email: normalizedEmail,
  token: z.string().trim().regex(/^\d{6}$/),
  password: strongPassword,
}).strict();

export const passwordConfirmationSchema = z.object({
  password: z.string().min(1).max(128),
}).strict();

export const passwordSetupSchema = z.object({
  token: z.string().trim().regex(/^\d{6}$/),
  password: strongPassword,
}).strict();

const unsafeDisplayName = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;

export const profileUpdateSchema = z.object({
  displayName: z.string()
    .refine((value) => !unsafeDisplayName.test(value), "unsafe_display_name")
    .transform((value) => value.normalize("NFC").replace(/\s+/gu, " ").trim())
    .pipe(z.string().min(2).max(80)),
}).strict();
