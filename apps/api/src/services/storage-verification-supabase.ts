import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "../config/env.js";
import type { StorageVerificationGateway, VerificationJob } from "../types/storage.js";
import { AdminOperationError } from "./admin-supabase.js";

type JobRow = { id:string;storage_upload_id:string;status:VerificationJob["status"];attempts:number;lease_owner:string|null;observed_size_bytes:number|null;observed_checksum_sha256:string|null;failure_code:string|null };

export function createStorageVerificationGateway(environment: ApiEnvironment):StorageVerificationGateway {
  if (!environment.SUPABASE_SERVICE_ROLE_KEY) return unavailableStorageVerificationGateway();
  const client=createClient(environment.SUPABASE_URL,environment.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const call=async(name:string,parameters:Record<string,unknown>)=>{
    const {data,error}=await client.rpc(name,parameters).single<JobRow>();
    if(error||!data)throw new AdminOperationError(error?.code);
    return map(data);
  };
  return {
    create:(actor:string,uploadId:string,idempotencyKey=randomUUID())=>call("admin_create_storage_verification_job",{p_actor_user_id:actor,p_idempotency_key:idempotencyKey,p_storage_upload_id:uploadId}),
    async getByUpload(uploadId:string){const{data,error}=await client.from("storage_verification_jobs").select("id,storage_upload_id,status,attempts,lease_owner,observed_size_bytes,observed_checksum_sha256,failure_code").eq("storage_upload_id",uploadId).maybeSingle<JobRow>();if(error)throw new AdminOperationError(error.code);return data?map(data):null},
    claim:(actor:string,jobId:string,workerId:string,leaseSeconds:number)=>call("admin_claim_storage_verification_job",{p_actor_user_id:actor,p_job_id:jobId,p_worker_id:workerId,p_lease_seconds:leaseSeconds}),
    heartbeat:(actor:string,jobId:string,workerId:string,leaseSeconds:number)=>call("admin_heartbeat_storage_verification_job",{p_actor_user_id:actor,p_job_id:jobId,p_worker_id:workerId,p_lease_seconds:leaseSeconds}),
    finish:(actor:string,jobId:string,workerId:string,input:{succeeded:boolean;sizeBytes:number|null;checksumSha256:string|null;failureCode:string|null},requestId=randomUUID())=>call("admin_finish_storage_verification_job",{p_actor_user_id:actor,p_request_id:requestId,p_job_id:jobId,p_worker_id:workerId,p_succeeded:input.succeeded,p_observed_size_bytes:input.sizeBytes,p_observed_checksum_sha256:input.checksumSha256,p_failure_code:input.failureCode}),
  };
}

export function unavailableStorageVerificationGateway():StorageVerificationGateway{const no=async()=>{throw new Error("storage-verification-gateway-not-configured")};return{create:no,getByUpload:no,claim:no,heartbeat:no,finish:no};}

function map(row:JobRow):VerificationJob{return{id:row.id,storageUploadId:row.storage_upload_id,status:row.status,attempts:row.attempts,leaseOwner:row.lease_owner,observedSizeBytes:row.observed_size_bytes,observedChecksumSha256:row.observed_checksum_sha256,failureCode:row.failure_code};}
