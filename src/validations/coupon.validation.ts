import { z } from "zod";
import { pagination } from "./common";
export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/),
  description: z.string().max(200).optional(),
  type: z.enum(["percent", "fixed"]),
  value: z.number().int().min(1).max(10_000_000),
  minOrderMinor: z.number().int().min(0).default(0),
  maxDiscountMinor: z.number().int().min(1).optional(),
  appliesTo: z.enum(["all", "products", "pets"]).default("all"),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  usageLimit: z.number().int().min(1).optional(),
  perCustomerLimit: z.number().int().min(1).max(100).default(1),
  isActive: z.boolean().default(true),
}).strict().refine((v) => v.type !== "percent" || v.value <= 100, { message: "percent coupons are 1-100", path: ["value"] })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] });

export const couponUpdateSchema = z.object({ description: z.string().max(200), isActive: z.boolean(), endsAt: z.coerce.date().nullable(), usageLimit: z.number().int().min(1).nullable(), perCustomerLimit: z.number().int().min(1).max(100), minOrderMinor: z.number().int().min(0), maxDiscountMinor: z.number().int().min(1).nullable() }).partial().strict();

export const couponQuery = pagination.extend({ q: z.string().trim().toUpperCase().max(40).optional() }).strict();

