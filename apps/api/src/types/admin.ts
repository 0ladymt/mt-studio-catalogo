export const STAFF_ROLES = ["owner", "admin", "catalog_manager", "support"] as const;
export type StaffRole = typeof STAFF_ROLES[number];

export const STAFF_PERMISSIONS = [
  "admin:access",
  "staff:manage",
  "catalog:read",
  "catalog:write",
  "catalog:publish",
  "support:read",
  "audit:read",
] as const;
export type StaffPermission = typeof STAFF_PERMISSIONS[number];

export type StaffMember = {
  userId: string;
  role: StaffRole;
  status: "active" | "disabled";
};

export type PageOptions = { limit: number; offset: number };

export type ProductCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
};

export type CategoryInput = Pick<ProductCategory, "slug" | "name" | "description" | "sortOrder" | "status">;

export type DraftProduct = {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  description: string;
  status: "draft" | "published" | "unpublished" | "archived";
  featured: boolean;
  currentVersionId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DraftProductInput = Pick<DraftProduct, "categoryId" | "slug" | "name" | "description" | "featured">;

export type ProductListOptions = PageOptions & {
  status?: DraftProduct["status"];
  categoryId?: string;
};

export type ProductVersion = {
  id: string;
  productId: string;
  versionLabel: string;
  releaseSequence: number;
  releaseNotes: string | null;
  status: "draft" | "published" | "retired";
  availableFrom: string | null;
  availableUntil: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductVersionInput = Pick<ProductVersion, "versionLabel" | "releaseSequence" | "releaseNotes" | "availableFrom" | "availableUntil">;

export type ProductPrice = {
  id: string;
  productVersionId: string;
  amountCents: number;
  currency: "BRL";
  status: "scheduled" | "active" | "retired";
  validFrom: string;
  validUntil: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductPriceInput = Pick<ProductPrice, "amountCents" | "validFrom" | "validUntil">;
export type ProductMedia = { id:string; productId:string; mediaType:"cover"|"gallery"; storageKey:string; altText:string; sortOrder:number; status:"active"|"archived"; createdAt:string; updatedAt:string };
export type ProductMediaInput = Pick<ProductMedia,"storageKey"|"altText"|"sortOrder">;
export type ProductFile = { id:string; productVersionId:string; displayName:string; storageKey:string; mimeType:string; sizeBytes:number; checksumSha256:string; sortOrder:number; status:"active"|"retired"; storageStatus:"metadata_only"|"verified"|"ready"|"failed"; verifiedAt:string|null; createdAt:string; updatedAt:string };
export type ProductFileInput = Pick<ProductFile,"storageKey"|"displayName"|"mimeType"|"sizeBytes"|"checksumSha256"|"sortOrder">;
export type ProductFileUpdateInput = Omit<ProductFileInput,"storageKey">;
export type PublicationReadiness = { productId:string; ready:boolean; blockers:string[] };

export interface AdminGateway {
  getStaffMember(userId: string): Promise<StaffMember | null>;
  listCategories(options: PageOptions): Promise<{ items: ProductCategory[]; total: number }>;
  createCategory(actorUserId: string, requestId: string, input: CategoryInput): Promise<ProductCategory>;
  updateCategory(actorUserId: string, requestId: string, categoryId: string, input: CategoryInput): Promise<ProductCategory>;
  listProducts(options: ProductListOptions): Promise<{ items: DraftProduct[]; total: number }>;
  getProduct(productId: string): Promise<DraftProduct | null>;
  createDraftProduct(actorUserId: string, requestId: string, input: DraftProductInput): Promise<DraftProduct>;
  updateDraftProduct(actorUserId: string, requestId: string, productId: string, input: DraftProductInput): Promise<DraftProduct>;
  archiveDraftProduct(actorUserId: string, requestId: string, productId: string): Promise<DraftProduct>;
  listVersions(productId: string, options: PageOptions): Promise<{ items: ProductVersion[]; total: number }>;
  getVersion(versionId: string): Promise<ProductVersion | null>;
  createVersion(actorUserId: string, requestId: string, productId: string, input: ProductVersionInput): Promise<ProductVersion>;
  updateVersion(actorUserId: string, requestId: string, versionId: string, input: ProductVersionInput): Promise<ProductVersion>;
  retireVersion(actorUserId: string, requestId: string, versionId: string): Promise<ProductVersion>;
  listPrices(versionId: string, options: PageOptions): Promise<{ items: ProductPrice[]; total: number }>;
  getPrice(priceId: string): Promise<ProductPrice | null>;
  createPrice(actorUserId: string, requestId: string, versionId: string, input: ProductPriceInput): Promise<ProductPrice>;
  activatePrice(actorUserId: string, requestId: string, priceId: string): Promise<ProductPrice>;
  retirePrice(actorUserId: string, requestId: string, priceId: string): Promise<ProductPrice>;
  listMedia(productId:string, options:PageOptions):Promise<{items:ProductMedia[];total:number}>;
  createMedia(actor:string, requestId:string, productId:string, input:ProductMediaInput):Promise<ProductMedia>;
  updateMedia(actor:string, requestId:string, mediaId:string, input:Omit<ProductMediaInput,"storageKey">):Promise<ProductMedia>;
  setCover(actor:string, requestId:string, mediaId:string):Promise<ProductMedia>;
  deactivateMedia(actor:string, requestId:string, mediaId:string):Promise<ProductMedia>;
  listFiles(versionId:string, options:PageOptions):Promise<{items:ProductFile[];total:number}>;
  getFile(fileId:string):Promise<ProductFile|null>;
  createFile(actor:string, requestId:string, versionId:string, input:ProductFileInput):Promise<ProductFile>;
  updateFile(actor:string, requestId:string, fileId:string, input:ProductFileUpdateInput):Promise<ProductFile>;
  retireFile(actor:string, requestId:string, fileId:string):Promise<ProductFile>;
  getPublicationReadiness(actor:string, productId:string):Promise<PublicationReadiness>;
  publishProduct(actor:string,requestId:string,productId:string,versionId:string):Promise<DraftProduct>;
  unpublishProduct(actor:string,requestId:string,productId:string,reason:string):Promise<DraftProduct>;
}
