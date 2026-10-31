import { z } from "zod";
import { objectId } from "./common";

const item = z.discriminatedUnion("itemType", [
  z.object({ itemType: z.literal("pet"), petId: objectId, quantity: z.literal(1).default(1) }).strict(),
  z.object({ itemType: z.literal("product"), productId: objectId, quantity: z.number().int().min(1).max(100) }).strict(),
]);

/** Note: NO price, total, tax or paymentStatus fields are accepted from the browser. */
export const createOrderSchema = z
  .object({
    items: z.array(item).min(1).max(50),
    shippingAddressId: objectId,
    billingAddressId: objectId.optional(),
    customerNote: z.string().max(1000).optional(),
    couponCode: z.string().trim().min(3).max(40).optional(),
    idempotencyKey: z.string().min(8).max(100),
  })
  .strict();

export const adminShippingSchema = z
  .object({
    partner: z.string().max(80).optional(),
    trackingNumber: z.string().max(80).optional(),
    trackingUrl: z.string().url().max(2048).optional(),
    estimatedDelivery: z.coerce.date().optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type AdminShippingInput = z.input<typeof adminShippingSchema>;
