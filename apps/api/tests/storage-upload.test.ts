import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { LocalS3Simulator } from "../src/storage/local-s3-simulator.js";
import type { ApiEnvironment } from "../src/config/env.js";
import type { AdminGateway, ProductFile } from "../src/types/admin.js";
import type { AuthGateway } from "../src/types/auth.js";
import type { ObjectInspection, StorageUpload, StorageUploadGateway } from "../src/types/storage.js";

const userId="11111111-1111-4111-8111-111111111111",fileId="22222222-2222-4222-8222-222222222222";
const body=new TextEncoder().encode("arquivo fictício MT STUDIO");
const checksum=createHash("sha256").update(body).digest("hex");
const environment:ApiEnvironment={APP_ENV:"test",API_HOST:"127.0.0.1",API_PORT:8787,SUPABASE_URL:"http://127.0.0.1:54321",SUPABASE_PUBLISHABLE_KEY:"test-key-which-is-long-enough",ALLOWED_ORIGINS:"http://127.0.0.1:4173",SESSION_REFRESH_MAX_AGE:2592000,GOOGLE_OAUTH_CALLBACK_URL:"http://127.0.0.1:8787/api/auth/google/callback",GOOGLE_IDENTITY_LINK_CALLBACK_URL:"http://127.0.0.1:8787/api/auth/google/link/callback",OAUTH_TRANSACTION_TTL_SECONDS:600,SENSITIVE_AUTHORIZATION_TTL_SECONDS:300,PUBLIC_SITE_URL:"http://127.0.0.1:4173"};
const file:ProductFile={id:fileId,productVersionId:"33333333-3333-4333-8333-333333333333",displayName:"poc.zip",storageKey:"products/poc.zip",mimeType:"application/zip",sizeBytes:body.byteLength,checksumSha256:checksum,sortOrder:0,status:"active",storageStatus:"metadata_only",verifiedAt:null,createdAt:"2026-10-22T00:00:00Z",updatedAt:"2026-10-22T00:00:00Z"};
const headers={Origin:environment.PUBLIC_SITE_URL,Cookie:"mt_access=valid; mt_csrf=proof","X-CSRF-Token":"proof","Content-Type":"application/json"};

function auth():AuthGateway{return{verifyAccessToken:vi.fn(async token=>token==="valid"?{id:userId}:null),refreshSession:vi.fn(async()=>null),revokeSession:vi.fn(),signUpWithPassword:vi.fn(),confirmSignup:vi.fn(async()=>false),resendSignupConfirmation:vi.fn(),signInWithPassword:vi.fn(async()=>({status:"invalid_credentials" as const})),requestPasswordRecovery:vi.fn(),resetPasswordWithOtp:vi.fn(async()=>false),beginGoogleOAuth:vi.fn(async()=>({authorizationUrl:"",pkceStorage:{}})),completeGoogleOAuth:vi.fn(async()=>null),confirmCurrentPassword:vi.fn(async()=>false),beginGoogleIdentityLink:vi.fn(async()=>({authorizationUrl:"",pkceStorage:{}})),completeGoogleIdentityLink:vi.fn(async()=>null),hasPassword:vi.fn(async()=>false),requestPasswordSetup:vi.fn(async()=>false),setupPasswordWithOtp:vi.fn(async()=>"invalid_or_expired" as const),getOwnProfile:vi.fn(async()=>null),updateOwnProfile:vi.fn(async()=>{throw new Error("unused");})};}
function admin(role:"catalog_manager"|"support"="catalog_manager"):AdminGateway{return{getStaffMember:vi.fn(async()=>({userId,role,status:"active"})),getFile:vi.fn(async id=>id===fileId?file:null)} as unknown as AdminGateway;}
function uploads():StorageUploadGateway{
  const records=new Map<string,StorageUpload>(),requests=new Map<string,string>();
  return{
    async beginUpload(actor,requestId,productFileId,expiresAt){const existing=requests.get(requestId);if(existing)return records.get(existing)!;const id=randomUUID(),record:StorageUpload={id,productFileId,objectKey:`private/${productFileId}/${id}.bin`,provider:"s3",status:"initiated",expectedSizeBytes:body.byteLength,expectedChecksumSha256:checksum,observedSizeBytes:null,observedChecksumSha256:null,initiatedBy:actor,requestId,expiresAt,verifiedAt:null,failureCode:null};records.set(id,record);requests.set(requestId,id);return record;},
    async getUpload(id){return records.get(id)??null;},
    async confirmUpload(_actor,_requestId,id,inspection:ObjectInspection){const current=records.get(id)!;let failure:string|null=null;if(!inspection.exists)failure="object_missing";else if(inspection.integrity!=="trusted_full_object")failure="untrusted_integrity";else if(inspection.sizeBytes!==current.expectedSizeBytes)failure="size_mismatch";else if(inspection.checksumSha256!==current.expectedChecksumSha256)failure="checksum_mismatch";const result={...current,status:failure?"failed" as const:"verified" as const,observedSizeBytes:inspection.sizeBytes,observedChecksumSha256:inspection.checksumSha256,verifiedAt:failure?null:new Date().toISOString(),failureCode:failure};records.set(id,result);return result;}
  };
}

async function begin(app:ReturnType<typeof createApp>,requestId=randomUUID()){const response=await app.request(`/api/admin/files/${fileId}/uploads`,{method:"POST",headers,body:JSON.stringify({requestId})});return{response,payload:await response.json() as {upload:{id:string;url:string;headers:Record<string,string>}}};}

describe("local private object upload proof of concept",()=>{
  it("creates a multipart transaction without issuing a single-object URL",async()=>{
    const storage=new LocalS3Simulator(),presign=vi.spyOn(storage,"createPresignedPut"),gateway=uploads(),app=createApp(auth(),environment,admin(),storage,gateway);
    const response=await app.request(`/api/admin/files/${fileId}/uploads`,{method:"POST",headers,body:JSON.stringify({requestId:randomUUID(),mode:"multipart"})});
    expect(response.status).toBe(201);await expect(response.json()).resolves.toMatchObject({upload:{status:"initiated"}});expect(presign).not.toHaveBeenCalled();
  });
  it("requires catalog write, Origin and CSRF before creating a transaction",async()=>{
    const storage=new LocalS3Simulator(),gateway=uploads();
    expect((await createApp(auth(),environment,admin("support"),storage,gateway).request(`/api/admin/files/${fileId}/uploads`,{method:"POST",headers,body:JSON.stringify({requestId:randomUUID()})})).status).toBe(403);
    expect((await createApp(auth(),environment,admin(),storage,gateway).request(`/api/admin/files/${fileId}/uploads`,{method:"POST",headers:{...headers,"X-CSRF-Token":"wrong"},body:JSON.stringify({requestId:randomUUID()})})).status).toBe(403);
    expect((await createApp(auth(),environment,admin(),storage,gateway).request(`/api/admin/files/${fileId}/uploads`,{method:"POST",headers:{...headers,Origin:"https://evil.invalid"},body:JSON.stringify({requestId:randomUUID()})})).status).toBe(403);
  });

  it("uploads directly through a short-lived URL and verifies the complete stored bytes",async()=>{
    const storage=new LocalS3Simulator(),gateway=uploads(),app=createApp(auth(),environment,admin(),storage,gateway);
    const{response,payload}=await begin(app);
    expect(response.status).toBe(201);expect(JSON.stringify(payload)).not.toMatch(/secret|credential|access.?key/i);
    expect(await storage.handle(new Request(payload.upload.url,{method:"PUT",headers:payload.upload.headers,body}))).toHaveProperty("status",201);
    const confirmed=await app.request(`/api/admin/storage-uploads/${payload.upload.id}/confirm`,{method:"POST",headers,body:JSON.stringify({requestId:randomUUID()})});
    expect(confirmed.status).toBe(200);await expect(confirmed.json()).resolves.toMatchObject({upload:{status:"verified",failureCode:null},fileStorageStatus:"verified"});
    expect(storage.isPubliclyReadable()).toBe(false);
  });

  it("rejects altered objects and never promotes browser-provided metadata",async()=>{
    const storage=new LocalS3Simulator(),gateway=uploads(),app=createApp(auth(),environment,admin(),storage,gateway);
    const{payload}=await begin(app);await storage.handle(new Request(payload.upload.url,{method:"PUT",headers:payload.upload.headers,body}));
    const record=await gateway.getUpload(payload.upload.id);storage.corruptObjectForTest(record!.objectKey);
    const confirmed=await app.request(`/api/admin/storage-uploads/${payload.upload.id}/confirm`,{method:"POST",headers,body:JSON.stringify({requestId:randomUUID(),storageStatus:"ready",checksumSha256:checksum})});
    expect(confirmed.status).toBe(400);
    const valid=await app.request(`/api/admin/storage-uploads/${payload.upload.id}/confirm`,{method:"POST",headers,body:JSON.stringify({requestId:randomUUID()})});
    await expect(valid.json()).resolves.toMatchObject({upload:{status:"failed",failureCode:"checksum_mismatch"},fileStorageStatus:"metadata_only"});
  });

  it("enforces signed size, expiry, single object creation and idempotent initiation",async()=>{
    const storage=new LocalS3Simulator(),gateway=uploads(),app=createApp(auth(),environment,admin(),storage,gateway),requestId=randomUUID();
    const first=await begin(app,requestId),second=await begin(app,requestId);expect(second.payload.upload.id).toBe(first.payload.upload.id);
    expect((await storage.handle(new Request(first.payload.upload.url,{method:"PUT",headers:first.payload.upload.headers,body:new Uint8Array([1])}))).status).toBe(400);
    expect((await storage.handle(new Request(first.payload.upload.url,{method:"PUT",headers:first.payload.upload.headers,body}))).status).toBe(201);
    expect((await storage.handle(new Request(first.payload.upload.url,{method:"PUT",headers:first.payload.upload.headers,body}))).status).toBe(409);
    const expired=await storage.createPresignedPut({objectKey:"private/expired",contentType:"application/zip",sizeBytes:body.byteLength,expiresAt:new Date(Date.now()-1000)});
    expect((await storage.handle(new Request(expired.url,{method:"PUT",headers:expired.headers,body}))).status).toBe(403);
  });

  it("leaves the transaction retryable when storage inspection has a network failure",async()=>{
    const storage=new LocalS3Simulator(),gateway=uploads(),app=createApp(auth(),environment,admin(),storage,gateway);const{payload}=await begin(app);
    storage.inspectObject=vi.fn(async()=>{throw new Error("network unavailable");});
    const response=await app.request(`/api/admin/storage-uploads/${payload.upload.id}/confirm`,{method:"POST",headers,body:JSON.stringify({requestId:randomUUID()})});
    expect(response.status).toBe(503);expect((await gateway.getUpload(payload.upload.id))?.status).toBe("initiated");
  });
});
