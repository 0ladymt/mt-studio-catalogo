import{createHmac,timingSafeEqual}from"node:crypto";
export function validateMercadoPagoSignature(input:{signature:string|undefined;requestId:string|undefined;dataId:string|undefined;secret:string|undefined}):boolean{
 if(!input.signature||!input.requestId||!input.dataId||!input.secret)return false;
 const parts=Object.fromEntries(input.signature.split(",").map(part=>part.trim().split("=",2)));
 if(!parts.ts||!parts.v1)return false;
 const dataId=/^[A-Za-z0-9]+$/.test(input.dataId)?input.dataId.toLowerCase():input.dataId;
 const manifest=`id:${dataId};request-id:${input.requestId};ts:${parts.ts};`;
 const expected=createHmac("sha256",input.secret).update(manifest).digest("hex");
 const a=Buffer.from(expected),b=Buffer.from(parts.v1);return a.length===b.length&&timingSafeEqual(a,b);
}
