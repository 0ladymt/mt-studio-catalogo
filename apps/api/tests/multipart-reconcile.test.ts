import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { ApiEnvironment } from "../src/config/env.js";
import type { AdminGateway } from "../src/types/admin.js";
import type { AuthGateway } from "../src/types/auth.js";
import type { MultipartSession, MultipartUploadGateway, ObjectStorage, StorageUploadGateway } from "../src/types/storage.js";

const user="11111111-1111-4111-8111-111111111111",uploadId="22222222-2222-4222-8222-222222222222";
const environment:ApiEnvironment={APP_ENV:"test",API_HOST:"127.0.0.1",API_PORT:8787,SUPABASE_URL:"http://127.0.0.1:54321",SUPABASE_PUBLISHABLE_KEY:"test-key-which-is-long-enough",ALLOWED_ORIGINS:"http://127.0.0.1:4173",SESSION_REFRESH_MAX_AGE:2592000,GOOGLE_OAUTH_CALLBACK_URL:"http://127.0.0.1:8787/api/auth/google/callback",GOOGLE_IDENTITY_LINK_CALLBACK_URL:"http://127.0.0.1:8787/api/auth/google/link/callback",OAUTH_TRANSACTION_TTL_SECONDS:600,SENSITIVE_AUTHORIZATION_TTL_SECONDS:300,PUBLIC_SITE_URL:"http://127.0.0.1:4173"};
const headers={Origin:environment.PUBLIC_SITE_URL,Cookie:"mt_access=valid; mt_csrf=proof","X-CSRF-Token":"proof","Content-Type":"application/json"};
const auth={verifyAccessToken:vi.fn(async()=>({id:user})),refreshSession:vi.fn(async()=>null)} as unknown as AuthGateway;
const admin={getStaffMember:vi.fn(async()=>({userId:user,role:"catalog_manager",status:"active"}))} as unknown as AdminGateway;
const session:MultipartSession={id:randomUUID(),storageUploadId:uploadId,providerUploadId:"provider",initiatedBy:user,status:"uploading",partSizeBytes:8*1024*1024,totalParts:2,expiresAt:new Date(Date.now()+600000).toISOString()};
const uploads={getUpload:vi.fn(async()=>({id:uploadId,objectKey:"private/test.bin",expectedSizeBytes:10*1024*1024,expectedChecksumSha256:"a".repeat(64)}))} as unknown as StorageUploadGateway;

describe("multipart server reconciliation",()=>{
  it("records an uploaded but not yet confirmed part from trusted storage",async()=>{
    let parts:Array<{partNumber:number;sizeBytes:number;providerEtag:string}>=[];
    const gateway={get:vi.fn(async()=>session),listParts:vi.fn(async()=>parts),recordPart:vi.fn(async(_actor,_id,part)=>{parts=[...parts,part];return part;})} as unknown as MultipartUploadGateway;
    const storage={provider:"s3",listMultipartParts:vi.fn(async()=>[{partNumber:1,sizeBytes:8*1024*1024,etag:"trusted-etag"}])} as unknown as ObjectStorage;
    const response=await createApp(auth,environment,admin,storage,uploads,undefined,gateway).request(`/api/admin/multipart/${session.id}/reconcile`,{method:"POST",headers,body:"{}"});
    expect(response.status).toBe(200);expect(gateway.recordPart).toHaveBeenCalledWith(user,session.id,{partNumber:1,sizeBytes:8*1024*1024,providerEtag:"trusted-etag"});
  });
  it("blocks a storage part that changed after PostgreSQL confirmation",async()=>{
    const gateway={get:vi.fn(async()=>session),listParts:vi.fn(async()=>[{partNumber:1,sizeBytes:8*1024*1024,providerEtag:"frozen"}]),recordPart:vi.fn()} as unknown as MultipartUploadGateway;
    const storage={provider:"s3",listMultipartParts:vi.fn(async()=>[{partNumber:1,sizeBytes:8*1024*1024,etag:"changed"}])} as unknown as ObjectStorage;
    const response=await createApp(auth,environment,admin,storage,uploads,undefined,gateway).request(`/api/admin/multipart/${session.id}/reconcile`,{method:"POST",headers,body:"{}"});
    expect(response.status).toBe(409);expect(gateway.recordPart).not.toHaveBeenCalled();
  });
});
