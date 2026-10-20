import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "../config/env.js";
import type { AdminGateway, DraftProduct, ProductCategory, ProductFile, ProductMedia, ProductPrice, ProductVersion, PublicationReadiness, StaffMember } from "../types/admin.js";

type CategoryRow = {
  id: string; slug: string; name: string; description: string | null; sort_order: number;
  status: ProductCategory["status"]; created_at: string; updated_at: string;
};
type ProductRow = {
  id: string; category_id: string; slug: string; name: string; description: string;
  status: DraftProduct["status"]; featured: boolean; current_version_id: string | null;
  published_at: string | null; created_at: string; updated_at: string;
};
type VersionRow = {
  id: string; product_id: string; version_label: string; release_sequence: number;
  release_notes: string | null; status: ProductVersion["status"];
  available_from: string | null; available_until: string | null; locked_at: string | null;
  created_at: string; updated_at: string;
};
type PriceRow = {
  id: string; product_version_id: string; amount_cents: number; currency: "BRL";
  status: ProductPrice["status"]; valid_from: string; valid_until: string | null;
  locked_at: string | null; created_at: string; updated_at: string;
};
type MediaRow={id:string;product_id:string;media_type:ProductMedia["mediaType"];storage_key:string;alt_text:string;sort_order:number;status:ProductMedia["status"];created_at:string;updated_at:string};
type FileRow={id:string;product_version_id:string;display_name:string;storage_key:string;mime_type:string;size_bytes:number;checksum_sha256:string;sort_order:number;status:ProductFile["status"];storage_status:ProductFile["storageStatus"];verified_at:string|null;created_at:string;updated_at:string};
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

    async listVersions(productId, { limit, offset }) {
      const { data, error, count } = await client.from("product_versions")
        .select("id,product_id,version_label,release_sequence,release_notes,status,available_from,available_until,locked_at,created_at,updated_at", { count: "exact" })
        .eq("product_id", productId).order("release_sequence", { ascending: false }).order("id", { ascending: true })
        .range(offset, offset + limit - 1).returns<VersionRow[]>();
      if (error) throw new AdminOperationError(error.code);
      return { items: (data ?? []).map(mapVersion), total: count ?? 0 };
    },

    async getVersion(versionId) {
      const { data, error } = await client.from("product_versions")
        .select("id,product_id,version_label,release_sequence,release_notes,status,available_from,available_until,locked_at,created_at,updated_at")
        .eq("id", versionId).maybeSingle<VersionRow>();
      if (error) throw new AdminOperationError(error.code);
      return data ? mapVersion(data) : null;
    },

    async createVersion(actorUserId, requestId, productId, input) {
      return versionRpc(rpc, "admin_create_product_version", versionParameters(actorUserId, requestId, input, { p_product_id: productId }));
    },

    async updateVersion(actorUserId, requestId, versionId, input) {
      return versionRpc(rpc, "admin_update_product_version", versionParameters(actorUserId, requestId, input, { p_version_id: versionId }));
    },

    async retireVersion(actorUserId, requestId, versionId) {
      return versionRpc(rpc, "admin_retire_product_version", { p_actor_user_id: actorUserId, p_request_id: requestId, p_version_id: versionId });
    },

    async listPrices(versionId, { limit, offset }) {
      const { data, error, count } = await client.from("product_prices")
        .select("id,product_version_id,amount_cents,currency,status,valid_from,valid_until,locked_at,created_at,updated_at", { count: "exact" })
        .eq("product_version_id", versionId).order("created_at", { ascending: false }).order("id", { ascending: true })
        .range(offset, offset + limit - 1).returns<PriceRow[]>();
      if (error) throw new AdminOperationError(error.code);
      return { items: (data ?? []).map(mapPrice), total: count ?? 0 };
    },

    async getPrice(priceId) {
      const { data, error } = await client.from("product_prices")
        .select("id,product_version_id,amount_cents,currency,status,valid_from,valid_until,locked_at,created_at,updated_at")
        .eq("id", priceId).maybeSingle<PriceRow>();
      if (error) throw new AdminOperationError(error.code);
      return data ? mapPrice(data) : null;
    },

    async createPrice(actorUserId, requestId, versionId, input) {
      return priceRpc(rpc, "admin_create_product_price", {
        p_actor_user_id: actorUserId, p_request_id: requestId, p_product_version_id: versionId,
        p_amount_cents: input.amountCents, p_valid_from: input.validFrom, p_valid_until: input.validUntil,
      });
    },

    async activatePrice(actorUserId, requestId, priceId) {
      return priceRpc(rpc, "admin_activate_product_price", { p_actor_user_id: actorUserId, p_request_id: requestId, p_price_id: priceId });
    },

    async retirePrice(actorUserId, requestId, priceId) {
      return priceRpc(rpc, "admin_retire_product_price", { p_actor_user_id: actorUserId, p_request_id: requestId, p_price_id: priceId });
    },
    async listMedia(productId,{limit,offset}) { const {data,error,count}=await client.from("product_media").select("id,product_id,media_type,storage_key,alt_text,sort_order,status,created_at,updated_at",{count:"exact"}).eq("product_id",productId).order("sort_order").order("id").range(offset,offset+limit-1).returns<MediaRow[]>(); if(error)throw new AdminOperationError(error.code);return{items:(data??[]).map(mapMedia),total:count??0}; },
    async createMedia(actor,requestId,productId,input){return mediaRpc(rpc,"admin_create_product_media",{p_actor_user_id:actor,p_request_id:requestId,p_product_id:productId,p_storage_key:input.storageKey,p_alt_text:input.altText,p_sort_order:input.sortOrder});},
    async updateMedia(actor,requestId,mediaId,input){return mediaRpc(rpc,"admin_update_product_media",{p_actor_user_id:actor,p_request_id:requestId,p_media_id:mediaId,p_alt_text:input.altText,p_sort_order:input.sortOrder});},
    async setCover(actor,requestId,mediaId){return mediaRpc(rpc,"admin_set_product_cover",{p_actor_user_id:actor,p_request_id:requestId,p_media_id:mediaId});},
    async deactivateMedia(actor,requestId,mediaId){return mediaRpc(rpc,"admin_deactivate_product_media",{p_actor_user_id:actor,p_request_id:requestId,p_media_id:mediaId});},
    async listFiles(versionId,{limit,offset}){const {data,error,count}=await client.from("product_files").select("id,product_version_id,display_name,storage_key,mime_type,size_bytes,checksum_sha256,sort_order,status,storage_status,verified_at,created_at,updated_at",{count:"exact"}).eq("product_version_id",versionId).order("sort_order").order("id").range(offset,offset+limit-1).returns<FileRow[]>();if(error)throw new AdminOperationError(error.code);return{items:(data??[]).map(mapFile),total:count??0};},
    async getFile(fileId){const{data,error}=await client.from("product_files").select("id,product_version_id,display_name,storage_key,mime_type,size_bytes,checksum_sha256,sort_order,status,storage_status,verified_at,created_at,updated_at").eq("id",fileId).maybeSingle<FileRow>();if(error)throw new AdminOperationError(error.code);return data?mapFile(data):null;},
    async createFile(actor,requestId,versionId,input){return fileRpc(rpc,"admin_create_product_file",{p_actor_user_id:actor,p_request_id:requestId,p_product_version_id:versionId,p_display_name:input.displayName,p_storage_key:input.storageKey,p_mime_type:input.mimeType,p_size_bytes:input.sizeBytes,p_checksum_sha256:input.checksumSha256,p_sort_order:input.sortOrder});},
    async updateFile(actor,requestId,fileId,input){return fileRpc(rpc,"admin_update_product_file",{p_actor_user_id:actor,p_request_id:requestId,p_file_id:fileId,p_display_name:input.displayName,p_mime_type:input.mimeType,p_size_bytes:input.sizeBytes,p_checksum_sha256:input.checksumSha256,p_sort_order:input.sortOrder});},
    async retireFile(actor,requestId,fileId){return fileRpc(rpc,"admin_retire_product_file",{p_actor_user_id:actor,p_request_id:requestId,p_file_id:fileId});},
    async getPublicationReadiness(actor,productId){const{data,error}=await rpc("admin_product_publication_readiness",{p_actor_user_id:actor,p_product_id:productId}).single<PublicationReadiness>();if(error||!data)throw new AdminOperationError(error?.code);return data;},
    async publishProduct(actor,requestId,productId,versionId){return productRpc(rpc,"admin_publish_product",{p_actor_user_id:actor,p_request_id:requestId,p_product_id:productId,p_version_id:versionId});},
    async unpublishProduct(actor,requestId,productId,reason){return productRpc(rpc,"admin_unpublish_product",{p_actor_user_id:actor,p_request_id:requestId,p_product_id:productId,p_reason:reason});},
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
    listVersions: unavailable,
    getVersion: unavailable,
    createVersion: unavailable,
    updateVersion: unavailable,
    retireVersion: unavailable,
    listPrices: unavailable,
    getPrice: unavailable,
    createPrice: unavailable,
    activatePrice: unavailable,
    retirePrice: unavailable,
    listMedia:unavailable,createMedia:unavailable,updateMedia:unavailable,setCover:unavailable,deactivateMedia:unavailable,
    listFiles:unavailable,getFile:unavailable,createFile:unavailable,updateFile:unavailable,retireFile:unavailable,getPublicationReadiness:unavailable,
    publishProduct:unavailable,unpublishProduct:unavailable,
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

function mapVersion(row: VersionRow): ProductVersion {
  return {
    id: row.id, productId: row.product_id, versionLabel: row.version_label,
    releaseSequence: row.release_sequence, releaseNotes: row.release_notes, status: row.status,
    availableFrom: row.available_from, availableUntil: row.available_until, lockedAt: row.locked_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapPrice(row: PriceRow): ProductPrice {
  return {
    id: row.id, productVersionId: row.product_version_id, amountCents: row.amount_cents,
    currency: row.currency, status: row.status, validFrom: row.valid_from,
    validUntil: row.valid_until, lockedAt: row.locked_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function mapMedia(r:MediaRow):ProductMedia{return{id:r.id,productId:r.product_id,mediaType:r.media_type,storageKey:r.storage_key,altText:r.alt_text,sortOrder:r.sort_order,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at};}
function mapFile(r:FileRow):ProductFile{return{id:r.id,productVersionId:r.product_version_id,displayName:r.display_name,storageKey:r.storage_key,mimeType:r.mime_type,sizeBytes:r.size_bytes,checksumSha256:r.checksum_sha256,sortOrder:r.sort_order,status:r.status,storageStatus:r.storage_status,verifiedAt:r.verified_at,createdAt:r.created_at,updatedAt:r.updated_at};}

function versionParameters(actorUserId: string, requestId: string, input: Parameters<AdminGateway["createVersion"]>[3], target: Record<string, unknown>): Record<string, unknown> {
  return {
    p_actor_user_id: actorUserId, p_request_id: requestId, ...target,
    p_version_label: input.versionLabel, p_release_sequence: input.releaseSequence,
    p_release_notes: input.releaseNotes, p_available_from: input.availableFrom,
    p_available_until: input.availableUntil,
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

async function versionRpc(rpc: RpcCall, name: string, parameters: Record<string, unknown>): Promise<ProductVersion> {
  const { data, error } = await rpc(name, parameters).single<VersionRow>();
  if (error || !data) throw new AdminOperationError(error?.code);
  return mapVersion(data);
}

async function priceRpc(rpc: RpcCall, name: string, parameters: Record<string, unknown>): Promise<ProductPrice> {
  const { data, error } = await rpc(name, parameters).single<PriceRow>();
  if (error || !data) throw new AdminOperationError(error?.code);
  return mapPrice(data);
}
async function mediaRpc(rpc:RpcCall,name:string,parameters:Record<string,unknown>):Promise<ProductMedia>{const{data,error}=await rpc(name,parameters).single<MediaRow>();if(error||!data)throw new AdminOperationError(error?.code);return mapMedia(data);}
async function fileRpc(rpc:RpcCall,name:string,parameters:Record<string,unknown>):Promise<ProductFile>{const{data,error}=await rpc(name,parameters).single<FileRow>();if(error||!data)throw new AdminOperationError(error?.code);return mapFile(data);}
