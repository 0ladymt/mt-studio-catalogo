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
  inspectObject(objectKey: string): Promise<ObjectInspection>;
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
