import {z} from "zod";
export const commerceIdentifierSchema=z.string().uuid();
export const addCartItemSchema=z.object({productId:commerceIdentifierSchema}).strict();
export const checkoutSchema=z.object({requestId:commerceIdentifierSchema}).strict();
