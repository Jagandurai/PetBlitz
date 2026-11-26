import { z } from "zod";
import { objectId } from "./common";
import { isHttpUrl } from "@/lib/order-status";

const item = z.object({ itemType: z.literal("product"), productId: objectId, quantity: z.number().int().min(1).max(100) }).strict();

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

/** Courier details typed in by the admin. Leaving a field out keeps it; an empty string (null for the date) clears it. */
export const adminShippingSchema = z
  .object({
    partner: z.string().trim().max(80).optional(),
    trackingNumber: z.string().trim().max(80).optional(),
    trackingUrl: z.string().trim().max(2048).refine((v) => v === "" || isHttpUrl(v), "Enter a full http:// or https:// link").optional(),
    estimatedDelivery: z.preprocess((v) => (v === "" ? null : v), z.union([z.null(), z.coerce.date()])).optional(),
    customerRemarks: z.string().trim().max(500).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type AdminShippingInput = z.input<typeof adminShippingSchema>;
