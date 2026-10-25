export type ProviderPaymentStatus="pending"|"in_process"|"approved"|"rejected"|"cancelled"|"expired"|"refunded"|"charged_back";
export type PreparedPayment={id:string;order_id:string;external_reference:string;amount_cents:number;currency:"BRL";expires_at:string;provider_payment_id:string|null;status:string;qr_code:string|null;qr_code_base64:string|null;ticket_url:string|null};
export type PixCharge={providerPaymentId:string;externalReference:string;amountCents:number;currency:"BRL";status:ProviderPaymentStatus;statusDetail:string|null;qrCode:string|null;qrCodeBase64:string|null;ticketUrl:string|null;expiresAt:string|null};
export interface PaymentPersistence{
 prepare(userId:string,orderId:string,requestId:string,expiresAt:string):Promise<PreparedPayment>;
 record(paymentId:string,charge:PixCharge):Promise<PreparedPayment>;
 getForOrder(userId:string,orderId:string):Promise<Record<string,unknown>|null>;
 processWebhook(input:{providerEventId:string;providerPaymentId:string;webhookRequestId:string;payloadSha256:string;charge:PixCharge;requestId:string}):Promise<Record<string,unknown>>;
 reconcile(charge:PixCharge,requestId:string,providerEventId?:string):Promise<Record<string,unknown>>;
}
export interface MercadoPagoGateway{createPix(input:{amountCents:number;externalReference:string;description:string;payerEmail:string;expiresAt:string;idempotencyKey:string}):Promise<PixCharge>;getPayment(providerPaymentId:string):Promise<PixCharge>;}
