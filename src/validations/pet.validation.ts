import { z } from "zod";
import { boolish, discountFields, mediaInput, minorUnits, objectId, pagination, slug } from "./common";

const base = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slug.optional(),
  petCode: z.string().trim().min(3).max(30).optional(),
  type: z.enum(["dog", "cat"]), // only dogs and cats
  categoryId: objectId,
  breed: z.string().trim().max(100).optional(),
  shortDescription: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  extraDescriptions: z.array(z.object({ shortDescription: z.string().trim().max(300).optional(), description: z.string().max(5000).optional() })).max(10).optional(),
  customDetails: z.array(z.object({ name: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(500) })).max(30).optional(),
  dateOfBirth: z.coerce.date().optional(),
  age: z.object({ value: z.number().min(0).max(600), unit: z.enum(["days", "weeks", "months", "years"]) }).optional(),
  gender: z.enum(["male", "female"]).optional(),
  color: z.string().max(60).optional(),
  weightKg: z.number().min(0).max(200).optional(),
  vaccination: z
    .object({
      status: z.enum(["unknown", "none", "partial", "complete"]).default("unknown"),
      records: z.array(z.object({ name: z.string().max(120), date: z.coerce.date().optional(), nextDueDate: z.coerce.date().optional(), veterinarianName: z.string().max(120).optional() })).max(30).default([]),
    })
    .optional(),
  health: z.object({ internalNotes: z.string().max(5000).optional(), publicDisclosure: z.string().max(2000).optional() }).optional(),
  microchipId: z.string().trim().max(40).optional(),
  documents: z.array(z.object({ name: z.string().max(160), storageKey: z.string().max(512), docType: z.string().max(60).optional() })).max(20).optional(),
  media: z.array(mediaInput).max(20).optional(),
  price: minorUnits,
  ...discountFields,
  currency: z.literal("INR").default("INR"),
  hsnCode: z.string().trim().regex(/^\d{4,8}$/).optional(),
  taxCategory: z.string().max(40).default("standard"),
  taxRateBps: z.number().int().min(0).max(10000).default(0),
  isVisible: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  careInfo: z.string().max(3000).optional(),
});

export const createPetSchema = base.strict();
export const updatePetSchema = base.partial().strict();

export const petListQuery = pagination
  .extend({
    type: z.enum(["dog", "cat"]).optional(),
    category: slug.optional(),
    breed: z.string().trim().min(1).max(100).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    featured: boolish.optional(),
    sort: z.enum(["newest", "price_asc", "price_desc", "featured"]).default("newest"),
  })
  .strict();

export type CreatePetInput = z.input<typeof createPetSchema>;
export type UpdatePetInput = z.input<typeof updatePetSchema>;
export type PetListQuery = z.output<typeof petListQuery>;
