export type StoreProduct={id:string;slug:string;name:string;description:string;versionId:string;versionLabel:string;amountCents:number;currency:"BRL";coverKey:string|null;coverAlt:string|null};
export type CartItem={id:string;productId:string;productVersionId:string;name:string;versionLabel:string;amountCents:number|null;currency:"BRL"|null;coverKey:string|null;available:boolean};
export type Cart={id:string;items:CartItem[];totalCents:number};
export type PendingOrder={id:string;status:"pending_payment"|"paid"|"expired"|"failed"|"refunded";totalCents:number;currency:"BRL";expiresAt:string;createdAt?:string;downloadEligible?:false;items?:Array<{id:string;productId:string;productVersionId:string;name:string;versionLabel:string;unitPriceCents:number;quantity:1;lineTotalCents:number}>};
export interface CommerceGateway{
 listStoreProducts():Promise<StoreProduct[]>;
 getCart(userId:string):Promise<Cart>;
 addCartItem(userId:string,productId:string):Promise<Cart>;
 removeCartItem(userId:string,itemId:string):Promise<Cart>;
 checkout(userId:string,requestId:string):Promise<PendingOrder>;
 getOrder(userId:string,orderId:string):Promise<PendingOrder|null>;
}
