import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "../config/env.js";
import type { ObjectInspection, StorageUpload, StorageUploadGateway } from "../types/storage.js";
import { AdminOperationError } from "./admin-supabase.js";

type UploadRow = {
  id: string;
  product_file_id: string;
  object_key: string;
  provider: "s3";
  status: StorageUpload["status"];
  expected_size_bytes: number;
  expected_checksum_sha256: string;
  observed_size_bytes: number | null;
  observed_checksum_sha256: string | null;
  initiated_by: string;
  request_id: string;
  expires_at: string;
  verified_at: string | null;
  failure_code: string | null;
};

type RpcCall = (name: string, parameters: Record<string, unknown>) => {
  single<T>(): PromiseLike<{ data: T | null; error: { code?: string } | null }>;
};

export function createStorageUploadSupabaseGateway(environment: ApiEnvironment): StorageUploadGateway {
  if (!environment.SUPABASE_SERVICE_ROLE_KEY) return unavailableStorageUploadGateway();
  const client = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const rpc = client.rpc.bind(client) as unknown as RpcCall;
  return {
    async beginUpload(actorUserId, requestId, productFileId, expiresAt) {
      return uploadRpc(rpc, "admin_begin_storage_upload", {
        p_actor_user_id: actorUserId,
        p_request_id: requestId,
        p_product_file_id: productFileId,
        p_expires_at: expiresAt,
      });
    },
    async getUpload(uploadId) {
      const { data, error } = await client.from("storage_uploads").select(UPLOAD_COLUMNS).eq("id", uploadId).maybeSingle<UploadRow>();
      if (error) throw new AdminOperationError(error.code);
      return data ? mapUpload(data) : null;
    },
    async getLatestForFile(productFileId) {
      const { data, error } = await client.from("storage_uploads").select(UPLOAD_COLUMNS).eq("product_file_id", productFileId).order("created_at", { ascending:false }).limit(1).maybeSingle<UploadRow>();
      if (error) throw new AdminOperationError(error.code);
      return data ? mapUpload(data) : null;
    },
    async confirmUpload(actorUserId, requestId, uploadId, inspection) {
      return uploadRpc(rpc, "admin_confirm_storage_upload", {
        p_actor_user_id: actorUserId,
        p_request_id: requestId,
        p_upload_id: uploadId,
        p_object_exists: inspection.exists,
        p_observed_size_bytes: inspection.sizeBytes,
        p_observed_checksum_sha256: inspection.checksumSha256,
        p_integrity_trusted: inspection.integrity === "trusted_full_object",
      });
    },
  };
}

export function unavailableStorageUploadGateway(): StorageUploadGateway {
  return { beginUpload: unavailable, getUpload: unavailable, getLatestForFile: unavailable, confirmUpload: unavailable };
}

async function unavailable(): Promise<never> {
  throw new Error("storage-upload-gateway-not-configured");
}

const UPLOAD_COLUMNS = "id,product_file_id,object_key,provider,status,expected_size_bytes,expected_checksum_sha256,observed_size_bytes,observed_checksum_sha256,initiated_by,request_id,expires_at,verified_at,failure_code";

async function uploadRpc(rpc: RpcCall, name: string, parameters: Record<string, unknown>): Promise<StorageUpload> {
  const { data, error } = await rpc(name, parameters).single<UploadRow>();
  if (error || !data) throw new AdminOperationError(error?.code);
  return mapUpload(data);
}

function mapUpload(row: UploadRow): StorageUpload {
  return {
    id: row.id,
    productFileId: row.product_file_id,
    objectKey: row.object_key,
    provider: row.provider,
    status: row.status,
    expectedSizeBytes: row.expected_size_bytes,
    expectedChecksumSha256: row.expected_checksum_sha256,
    observedSizeBytes: row.observed_size_bytes,
    observedChecksumSha256: row.observed_checksum_sha256,
    initiatedBy: row.initiated_by,
    requestId: row.request_id,
    expiresAt: row.expires_at,
    verifiedAt: row.verified_at,
    failureCode: row.failure_code,
  };
}

export function untrustedInspection(exists: boolean, sizeBytes: number | null, checksumSha256: string | null): ObjectInspection {
  return { exists, sizeBytes, checksumSha256, integrity: "unverified" };
}
