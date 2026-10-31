import { z } from "zod";
import { objectId } from "./common";
export const addCartItemSchema = z.discriminatedUnion("itemType", [
  z.object({ itemType: z.literal("pet"), petId: objectId }).strict(),
  z.object({ itemType: z.literal("product"), productId: objectId, quantity: z.number().int().min(1).max(100).default(1) }).strict(),
]);

export const setQuantitySchema = z.object({ quantity: z.number().int().min(1).max(100) }).strict();

export const checkoutSchema = z.object({ shippingAddressId: objectId, billingAddressId: objectId.optional(), couponCode: z.string().trim().min(3).max(40).optional(), customerNote: z.string().max(1000).optional(), idempotencyKey: z.string().min(8).max(100) }).strict();

export const couponPreviewSchema = z.object({ code: z.string().trim().min(3).max(40) }).strict();

