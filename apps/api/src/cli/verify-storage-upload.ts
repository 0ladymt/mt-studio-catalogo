import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { loadPrivateEnvironmentFile, readEnvironment } from "../config/env.js";
import { createStorageUploadSupabaseGateway } from "../services/storage-upload-supabase.js";
import { createStorageVerificationGateway } from "../services/storage-verification-supabase.js";
import { createConfiguredObjectStorage, R2StorageError } from "../storage/r2-s3-storage.js";
import { StreamIntegrityError } from "../storage/stream-integrity.js";

const id=z.string().uuid();
const uploadId=id.parse(process.argv[2]);
loadPrivateEnvironmentFile();
const environment=readEnvironment();
if(!["development","test"].includes(environment.APP_ENV))throw new Error("local-verifier-disabled-outside-development");
const bffUrl=z.string().url().parse(process.env.LOCAL_VERIFIER_BFF_URL??`http://${environment.API_HOST}:${environment.API_PORT}`);
const secret=randomBytes(32).toString("base64url"),secretHash=createHash("sha256").update(secret).digest("hex");
const authorizationResponse=await fetch(`${bffUrl}/api/local-verifier/authorizations`,{method:"POST",headers:{"content-type":"application/json","x-mt-studio-cli":"1"},body:JSON.stringify({uploadId,secretHash})});
if(!authorizationResponse.ok)throw new Error("local-verifier-authorization-start-failed");
const started=z.object({authorization:z.object({id:id,status:z.literal("pending"),expiresAt:z.string(),approvalUrl:z.string().url()})}).parse(await authorizationResponse.json());
console.info(`Abra esta página local para autorizar a verificação: ${started.authorization.approvalUrl}`);
const consumed=await waitForAuthorization(bffUrl,started.authorization.id,secret,new Date(started.authorization.expiresAt).getTime());
if(consumed.uploadId!==uploadId)throw new Error("local-verifier-scope-mismatch");
const storage=createConfiguredObjectStorage(process.env);
if(!storage)throw new Error("storage-provider-disabled");

const actor=consumed.actorUserId;
const uploads=createStorageUploadSupabaseGateway(environment);
const jobs=createStorageVerificationGateway(environment);
const upload=await uploads.getUpload(uploadId);
if(!upload)throw new Error("storage-upload-not-found");
const job=await jobs.create(actor,upload.id);
if(job.status==="completed"){
  console.info("Verification already completed; no object was changed.");
  process.exit(0);
}
const workerId=randomUUID();
await jobs.claim(actor,job.id,workerId,300);
const heartbeat=setInterval(()=>void jobs.heartbeat(actor,job.id,workerId,300).catch(()=>{}),60_000);
heartbeat.unref();
try{
  const inspection=await storage.inspectObject(upload.objectKey,{sizeBytes:upload.expectedSizeBytes,checksumSha256:upload.expectedChecksumSha256});
  const succeeded=inspection.exists&&inspection.integrity==="trusted_full_object"&&inspection.sizeBytes===upload.expectedSizeBytes&&inspection.checksumSha256===upload.expectedChecksumSha256;
  await jobs.finish(actor,job.id,workerId,{succeeded,sizeBytes:inspection.sizeBytes,checksumSha256:inspection.checksumSha256,failureCode:succeeded?null:failureFor(inspection.exists,inspection.sizeBytes,inspection.checksumSha256,upload.expectedSizeBytes,upload.expectedChecksumSha256)});
  if(!succeeded)throw new Error("verification-did-not-match");
  console.info("Verification completed with trusted full-object SHA-256; file remains verified, not ready.");
}catch(error){
  const code=safeFailure(error);
  await jobs.finish(actor,job.id,workerId,{succeeded:false,sizeBytes:null,checksumSha256:null,failureCode:code}).catch(()=>{});
  throw new Error(`verification-failed:${code}`);
}finally{clearInterval(heartbeat);}

function failureFor(exists:boolean,size:number|null,hash:string|null,expectedSize:number,expectedHash:string){if(!exists)return"object_missing";if(size!==expectedSize)return"size_mismatch";if(hash!==expectedHash)return"checksum_mismatch";return"storage_failure";}
function safeFailure(error:unknown){if(error instanceof StreamIntegrityError)return error.code;if(error instanceof R2StorageError)return error.code;return"storage_failure";}
async function waitForAuthorization(base:string,authorizationId:string,authorizationSecret:string,expiresAt:number):Promise<{actorUserId:string;uploadId:string}>{
  while(Date.now()<expiresAt){
    let response:Response;
    try{response=await fetch(`${base}/api/local-verifier/authorizations/${authorizationId}/consume`,{method:"POST",headers:{"content-type":"application/json","x-mt-studio-cli":"1"},body:JSON.stringify({secret:authorizationSecret})});}
    catch{await new Promise(resolve=>setTimeout(resolve,10_000));continue;}
    if(response.ok){const value=z.object({authorization:z.object({status:z.literal("consumed"),actorUserId:id,uploadId:id})}).parse(await response.json());return value.authorization;}
    if(![403,409,429].includes(response.status))throw new Error(`local-verifier-authorization-failed:${response.status}`);
    await new Promise(resolve=>setTimeout(resolve,10_000));
  }
  throw new Error("local-verifier-authorization-expired");
}
