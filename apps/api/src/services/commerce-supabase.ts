import {createClient} from "@supabase/supabase-js";
import type {ApiEnvironment} from "../config/env.js";
import type {Cart,CommerceGateway,PendingOrder,StoreProduct} from "../types/commerce.js";

export class CommerceOperationError extends Error{constructor(readonly databaseCode?:string){super("commerce-operation-failed");}}

export function createCommerceSupabaseGateway(environment:ApiEnvironment):CommerceGateway{
 const key=environment.SUPABASE_SERVICE_ROLE_KEY;if(!key)return unavailableCommerceGateway();
 const client=createClient(environment.SUPABASE_URL,key,{auth:{autoRefreshToken:false,detectSessionInUrl:false,persistSession:false}});
 const call=async<T>(name:string,parameters:Record<string,unknown>):Promise<T>=>{const{data,error}=await client.rpc(name,parameters);if(error)throw new CommerceOperationError(error.code);return data as T;};
 return{
  async listStoreProducts(){
   const{data,error}=await client.from("products").select("id,slug,name,description,current_version_id,product_versions!products_current_version_same_product_fk(version_label,status,product_prices(amount_cents,currency,status,valid_from,valid_until)),product_media(storage_key,alt_text,media_type,status)").eq("status","published").order("featured",{ascending:false}).order("name");
   if(error)throw new CommerceOperationError(error.code);const now=Date.now();
   return(data??[]).flatMap((row:any)=>{const version=Array.isArray(row.product_versions)?row.product_versions[0]:row.product_versions;if(!version||version.status!=="published")return[];const price=(version.product_prices??[]).find((p:any)=>p.status==="active"&&Date.parse(p.valid_from)<=now&&(!p.valid_until||Date.parse(p.valid_until)>now));if(!price)return[];const cover=(row.product_media??[]).find((m:any)=>m.status==="active"&&m.media_type==="cover");return[{id:row.id,slug:row.slug,name:row.name,description:row.description,versionId:row.current_version_id,versionLabel:version.version_label,amountCents:Number(price.amount_cents),currency:"BRL",coverKey:cover?.storage_key??null,coverAlt:cover?.alt_text??null} satisfies StoreProduct];});
  },
  getCart:userId=>call<Cart>("commerce_get_cart",{p_user_id:userId}),
  addCartItem:(userId,productId)=>call<Cart>("commerce_add_cart_item",{p_user_id:userId,p_product_id:productId}),
  removeCartItem:(userId,itemId)=>call<Cart>("commerce_remove_cart_item",{p_user_id:userId,p_item_id:itemId}),
  checkout:(userId,requestId)=>call<PendingOrder>("commerce_checkout_cart",{p_user_id:userId,p_request_id:requestId}),
  async getOrder(userId,orderId){return call<PendingOrder|null>("commerce_get_order",{p_user_id:userId,p_order_id:orderId});}
 };
}

export function unavailableCommerceGateway():CommerceGateway{const unavailable=async()=>{throw new CommerceOperationError();};return{listStoreProducts:unavailable,getCart:unavailable,addCartItem:unavailable,removeCartItem:unavailable,checkout:unavailable,getOrder:unavailable};}
