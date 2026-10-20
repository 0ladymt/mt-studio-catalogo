import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "../config/env.js";
import type { AdminGateway, DraftProduct, ProductCategory, StaffMember } from "../types/admin.js";

type CategoryRow = {
  id: string; slug: string; name: string; description: string | null; sort_order: number;
  status: ProductCategory["status"]; created_at: string; updated_at: string;
};
type ProductRow = {
  id: string; category_id: string; slug: string; name: string; description: string;
  status: DraftProduct["status"]; featured: boolean; current_version_id: string | null;
  published_at: string | null; created_at: string; updated_at: string;
};
type RpcError = { code?: string } | null;
type RpcCall = (name: string, parameters: Record<string, unknown>) => {
  single<T>(): PromiseLike<{ data: T | null; error: RpcError }>;
};

export class AdminOperationError extends Error {
  constructor(readonly databaseCode?: string) {
    super("administrative-operation-failed");
  }
}

export function createAdminSupabaseGateway(environment: ApiEnvironment): AdminGateway {
  const serviceKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return unavailableAdminGateway();

  const client = createClient(environment.SUPABASE_URL, serviceKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const rpc = client.rpc.bind(client) as unknown as RpcCall;

  return {
    async getStaffMember(userId) {
      const { data, error } = await client
        .from("staff_members")
        .select("user_id,role,status")
        .eq("user_id", userId)
        .maybeSingle<{ user_id: string; role: StaffMember["role"]; status: StaffMember["status"] }>();
      if (error) throw new Error("staff-authorization-query-failed");
      return data ? { userId: data.user_id, role: data.role, status: data.status } : null;
    },

    async listCategories({ limit, offset }) {
      const { data, error, count } = await client
        .from("product_categories")
        .select("id,slug,name,description,sort_order,status,created_at,updated_at", { count: "exact" })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1)
        .returns<CategoryRow[]>();
      if (error) throw new AdminOperationError(error.code);
      return { items: (data ?? []).map(mapCategory), total: count ?? 0 };
    },

    async createCategory(actorUserId, requestId, input) {
      return categoryRpc(rpc, "admin_create_category", {
        p_actor_user_id: actorUserId, p_request_id: requestId, p_slug: input.slug,
        p_name: input.name, p_description: input.description, p_sort_order: input.sortOrder,
        p_status: input.status,
      });
    },

    async updateCategory(actorUserId, requestId, categoryId, input) {
      return categoryRpc(rpc, "admin_update_category", {
        p_actor_user_id: actorUserId, p_request_id: requestId, p_category_id: categoryId,
        p_slug: input.slug, p_name: input.name, p_description: input.description,
        p_sort_order: input.sortOrder, p_status: input.status,
      });
    },

    async listProducts({ limit, offset, status, categoryId }) {
      let query = client
        .from("products")
        .select("id,category_id,slug,name,description,status,featured,current_version_id,published_at,created_at,updated_at", { count: "exact" });
      if (status) query = query.eq("status", status);
      if (categoryId) query = query.eq("category_id", categoryId);
      const { data, error, count } = await query
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1)
        .returns<ProductRow[]>();
      if (error) throw new AdminOperationError(error.code);
      return { items: (data ?? []).map(mapProduct), total: count ?? 0 };
    },

    async getProduct(productId) {
      const { data, error } = await client
        .from("products")
        .select("id,category_id,slug,name,description,status,featured,current_version_id,published_at,created_at,updated_at")
        .eq("id", productId)
        .maybeSingle<ProductRow>();
      if (error) throw new AdminOperationError(error.code);
      return data ? mapProduct(data) : null;
    },

    async createDraftProduct(actorUserId, requestId, input) {
      return productRpc(rpc, "admin_create_draft_product", {
        p_actor_user_id: actorUserId, p_request_id: requestId, p_category_id: input.categoryId,
        p_slug: input.slug, p_name: input.name, p_description: input.description,
        p_featured: input.featured,
      });
    },

    async updateDraftProduct(actorUserId, requestId, productId, input) {
      return productRpc(rpc, "admin_update_draft_product", {
        p_actor_user_id: actorUserId, p_request_id: requestId, p_product_id: productId,
        p_category_id: input.categoryId, p_slug: input.slug, p_name: input.name,
        p_description: input.description, p_featured: input.featured,
      });
    },

    async archiveDraftProduct(actorUserId, requestId, productId) {
      return productRpc(rpc, "admin_archive_draft_product", {
        p_actor_user_id: actorUserId, p_request_id: requestId, p_product_id: productId,
      });
    },
  };
}

export function unavailableAdminGateway(): AdminGateway {
  return {
    getStaffMember: unavailable,
    listCategories: unavailable,
    createCategory: unavailable,
    updateCategory: unavailable,
    listProducts: unavailable,
    getProduct: unavailable,
    createDraftProduct: unavailable,
    updateDraftProduct: unavailable,
    archiveDraftProduct: unavailable,
  };
}

async function unavailable(): Promise<never> {
  throw new Error("admin-gateway-not-configured");
}

function mapCategory(row: CategoryRow): ProductCategory {
  return {
    id: row.id, slug: row.slug, name: row.name, description: row.description,
    sortOrder: row.sort_order, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapProduct(row: ProductRow): DraftProduct {
  return {
    id: row.id, categoryId: row.category_id, slug: row.slug, name: row.name,
    description: row.description, status: row.status, featured: row.featured,
    currentVersionId: row.current_version_id, publishedAt: row.published_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function categoryRpc(rpc: RpcCall, name: string, parameters: Record<string, unknown>): Promise<ProductCategory> {
  const { data, error } = await rpc(name, parameters).single<CategoryRow>();
  if (error || !data) throw new AdminOperationError(error?.code);
  return mapCategory(data);
}

async function productRpc(rpc: RpcCall, name: string, parameters: Record<string, unknown>): Promise<DraftProduct> {
  const { data, error } = await rpc(name, parameters).single<ProductRow>();
  if (error || !data) throw new AdminOperationError(error?.code);
  return mapProduct(data);
}
