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
}
