import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadPrivateEnvironmentFile, readEnvironment } from "../config/env.js";
import { createStorageUploadSupabaseGateway } from "../services/storage-upload-supabase.js";
import { authenticateVerifier, createStorageVerificationGateway } from "../services/storage-verification-supabase.js";
import { createConfiguredObjectStorage, R2StorageError } from "../storage/r2-s3-storage.js";
import { StreamIntegrityError } from "../storage/stream-integrity.js";

const id=z.string().uuid();
const uploadId=id.parse(process.argv[2]);
loadPrivateEnvironmentFile();
const environment=readEnvironment();
const accessToken=z.string().min(20).parse(process.env.STORAGE_VERIFIER_ACCESS_TOKEN);
const storage=createConfiguredObjectStorage(process.env);
if(!storage)throw new Error("storage-provider-disabled");

const actor=await authenticateVerifier(environment,accessToken);
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
