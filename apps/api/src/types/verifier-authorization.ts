export type VerifierAuthorization={id:string;storageUploadId:string;status:"pending"|"approved"|"consumed"|"revoked"|"expired";approvedBy:string|null;expiresAt:string};
export interface VerifierAuthorizationGateway{
  create(uploadId:string,secretHash:string,expiresAt:string):Promise<VerifierAuthorization>;
  get(id:string):Promise<VerifierAuthorization|null>;
  approve(actor:string,requestId:string,id:string):Promise<VerifierAuthorization>;
  consume(id:string,secretHash:string):Promise<VerifierAuthorization>;
  revoke(actor:string,requestId:string,id:string):Promise<VerifierAuthorization>;
}
