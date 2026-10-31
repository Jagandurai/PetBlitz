import { z } from "zod";

const money = z.number().int().min(0).max(10_000_000);
export const settingsSchema = z.object({
  shipping: z.object({
    baseFeeMinor: money,
    freeAboveMinor: money.nullable(),
    stateFees: z.record(z.string().regex(/^\d{2}$/, "GST state code, e.g. 33"), money),
  }).partial().strict(),
  tax: z.object({
    pricesIncludeTax: z.boolean(),
    sellerStateCode: z.string().regex(/^\d{2}$/),
    sellerGstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, "invalid GSTIN").or(z.literal("")),
    legalName: z.string().max(160),
    address: z.string().max(400),
    invoicePrefix: z.string().regex(/^[A-Z0-9]{1,8}$/),
  }).partial().strict(),
  returns: z.object({ windowDays: z.number().int().min(0).max(60), petsReturnable: z.boolean() }).partial().strict(),
}).partial().strict();
export type SettingsInput = z.input<typeof settingsSchema>;
