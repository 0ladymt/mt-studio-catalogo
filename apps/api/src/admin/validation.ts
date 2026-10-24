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

const optionalTimestamp = z.union([z.iso.datetime({ offset: true }), z.null()]);

export const versionInputSchema = z.object({
  versionLabel: z.string().transform((value) => value.normalize("NFKC").trim()).pipe(z.string().min(1).max(40)),
  releaseSequence: z.number().int().positive().max(2147483647),
  releaseNotes: z.union([normalizedDescription(5000, true), z.null()]).optional().transform((value) => value || null),
  availableFrom: optionalTimestamp.optional().default(null),
  availableUntil: optionalTimestamp.optional().default(null),
}).strict().refine(
  ({ availableFrom, availableUntil }) => !availableFrom || !availableUntil || new Date(availableUntil) > new Date(availableFrom),
  { message: "invalid availability window", path: ["availableUntil"] },
);

export const priceInputSchema = z.object({
  amountCents: z.number().int().positive().max(999999999999),
  validFrom: z.iso.datetime({ offset: true }),
  validUntil: optionalTimestamp.optional().default(null),
}).strict().refine(
  ({ validFrom, validUntil }) => !validUntil || new Date(validUntil) > new Date(validFrom),
  { message: "invalid price window", path: ["validUntil"] },
);

const safeStorageKey = z.string().min(10).max(700).refine((value) => !value.includes("..") && !/^\/?(?:https?:|data:|file:)/iu.test(value));
export const mediaInputSchema = z.object({ storageKey:safeStorageKey.max(500), altText:normalizedName(240), sortOrder:z.number().int().min(0).max(100000) }).strict();
export const mediaUpdateSchema = mediaInputSchema.omit({ storageKey:true });
export const fileInputSchema = z.object({
  storageKey:safeStorageKey, displayName:normalizedName(240), mimeType:z.string().trim().min(3).max(150).regex(/^[\w.+-]+\/[\w.+-]+$/u),
  sizeBytes:z.number().int().positive().max(Number.MAX_SAFE_INTEGER), checksumSha256:z.string().toLowerCase().regex(/^[0-9a-f]{64}$/u), sortOrder:z.number().int().min(0).max(100000),
}).strict();
export const fileUpdateSchema = fileInputSchema.omit({ storageKey:true });
export const storageUploadRequestSchema = z.object({ requestId:identifierSchema, mode:z.enum(["single","multipart"]).optional() }).strict();
export const publishProductSchema=z.object({requestId:z.string().uuid(),versionId:z.string().uuid()}).strict();
export const unpublishProductSchema=z.object({requestId:z.string().uuid(),reason:z.string().transform(v=>v.normalize("NFKC").trim().replace(/\s+/gu," ")).pipe(z.string().min(5).max(500))}).strict();
