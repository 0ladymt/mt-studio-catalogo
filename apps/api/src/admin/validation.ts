import { z } from "zod";

const normalizedName = (maximum: number) => z.string()
  .transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(z.string().min(2).max(maximum));

const normalizedDescription = (maximum: number, allowEmpty = false) => z.string()
  .transform((value) => value.normalize("NFKC").replace(/\r\n?/gu, "\n").trim())
  .pipe(allowEmpty ? z.string().max(maximum) : z.string().min(1).max(maximum));

const normalizedSlug = z.string()
  .transform((value) => value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-"))
  .pipe(z.string().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u));

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
}).strict();

export const categoryInputSchema = z.object({
  slug: normalizedSlug,
  name: normalizedName(80),
  description: z.union([normalizedDescription(500, true), z.null()]).optional().transform((value) => value || null),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  status: z.enum(["active", "inactive"]).default("active"),
}).strict();

export const productInputSchema = z.object({
  categoryId: z.string().uuid(),
  slug: normalizedSlug,
  name: normalizedName(120),
  description: normalizedDescription(5000),
  featured: z.boolean().default(false),
}).strict();

export const productListQuerySchema = paginationSchema.extend({
  status: z.enum(["draft", "published", "unpublished", "archived"]).optional(),
  categoryId: z.string().uuid().optional(),
}).strict();

export const identifierSchema = z.string().uuid();
