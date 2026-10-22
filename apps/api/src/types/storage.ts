export type StorageUploadStatus = "initiated" | "verified" | "failed" | "expired";

export type StorageUpload = {
  id: string;
  productFileId: string;
  objectKey: string;
  provider: "s3";
  status: StorageUploadStatus;
  expectedSizeBytes: number;
  expectedChecksumSha256: string;
  observedSizeBytes: number | null;
  observedChecksumSha256: string | null;
  initiatedBy: string;
  requestId: string;
  expiresAt: string;
  verifiedAt: string | null;
  failureCode: string | null;
};

export type ObjectInspection = {
  exists: boolean;
  sizeBytes: number | null;
  checksumSha256: string | null;
  integrity: "trusted_full_object" | "unverified";
};

export interface ObjectStorage {
  readonly provider: "s3";
  createPresignedPut(input: {
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    expiresAt: Date;
  }): Promise<{ url: string; method: "PUT"; headers: Record<string, string>; expiresAt: string }>;
  inspectObject(
    objectKey: string,
    expected?: { sizeBytes: number; checksumSha256: string },
  ): Promise<ObjectInspection>;
  inspectStagingObject?(objectKey:string):Promise<ObjectInspection>;
  beginMultipart?(input:{objectKey:string;contentType:string}):Promise<{providerUploadId:string}>;
  createMultipartPartUrl?(input:{objectKey:string;providerUploadId:string;partNumber:number;sizeBytes:number;expiresAt:Date}):Promise<{url:string;method:"PUT";headers:Record<string,string>;expiresAt:string}>;
  listMultipartParts?(input:{objectKey:string;providerUploadId:string}):Promise<Array<{partNumber:number;sizeBytes:number;etag:string}>>;
  completeMultipart?(input:{objectKey:string;providerUploadId:string;parts:Array<{partNumber:number;etag:string}>}):Promise<void>;
  abortMultipart?(input:{objectKey:string;providerUploadId:string}):Promise<void>;
}

export interface StorageUploadGateway {
  beginUpload(actorUserId: string, requestId: string, productFileId: string, expiresAt: string): Promise<StorageUpload>;
  getUpload(uploadId: string): Promise<StorageUpload | null>;
  confirmUpload(
    actorUserId: string,
    requestId: string,
    uploadId: string,
    inspection: ObjectInspection,
  ): Promise<StorageUpload>;
}

export type MultipartSession={id:string;storageUploadId:string;providerUploadId:string;initiatedBy:string;status:"initiated"|"uploading"|"completed"|"cancelled"|"expired";partSizeBytes:number;totalParts:number;expiresAt:string};
export type MultipartPart={partNumber:number;sizeBytes:number;providerEtag:string};
export interface MultipartUploadGateway{
  begin(actor:string,requestId:string,storageUploadId:string,providerUploadId:string,partSizeBytes:number):Promise<MultipartSession>;
  get(id:string):Promise<MultipartSession|null>;
  listParts(id:string):Promise<MultipartPart[]>;
  recordPart(actor:string,id:string,part:MultipartPart):Promise<MultipartPart>;
  complete(actor:string,requestId:string,id:string):Promise<MultipartSession>;
  cancel(actor:string,requestId:string,id:string):Promise<MultipartSession>;
}
