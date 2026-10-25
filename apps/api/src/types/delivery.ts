export type OrderDownload={entitlementId:string;orderItemId:string;productVersionId:string;productFileId:string;displayName:string;sizeBytes:number;status:"active"|"suspended"};
export type OrderHistory={id:string;status:"pending_payment"|"paid"|"expired"|"failed"|"refunded";totalCents:number;currency:"BRL";createdAt:string;paidAt:string|null;downloadEligible:boolean;items:Array<{id:string;name:string;versionLabel:string;productVersionId:string;unitPriceCents:number;downloads:OrderDownload[]}>};
export type AuthorizedDownload={entitlementId:string;orderId:string;displayName:string;storageKey:string;sizeBytes:number;checksumSha256:string};
export interface DeliveryGateway{
 listOrders(userId:string):Promise<OrderHistory[]>;
 authorizeDownload(userId:string,orderId:string,entitlementId:string,requestId:string):Promise<AuthorizedDownload>;
}
