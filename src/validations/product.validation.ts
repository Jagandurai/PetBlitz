import { z } from "zod";
import { boolish, discountFields, mediaInput, minorUnits, objectId, pagination, slug } from "./common";

const base = z.object({
  name: z.string().trim().min(1).max(160),
  slug: slug.optional(),
  sku: z.string().trim().min(2).max(60),
  shortDescription: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  extraDescriptions: z.array(z.object({ shortDescription: z.string().trim().max(300).optional(), description: z.string().max(5000).optional() })).max(10).optional(),
  productType: z.string().trim().max(80).optional(),
  hsnCode: z.string().trim().regex(/^\d{4,8}$/).optional(),
  categoryId: objectId,
  subcategoryId: objectId.optional(),
  compatibility: z.array(z.enum(["dog", "cat"])).min(1).max(2),
  brand: z.string().trim().max(80).optional(),
  specifications: z.array(z.object({ key: z.string().max(60), value: z.string().max(200) })).max(40).optional(),
  material: z.string().max(100).optional(),
  colors: z.array(z.string().max(40)).max(30).optional(),
  sizes: z.array(z.string().max(40)).max(30).optional(),
  media: z.array(mediaInput).max(20).optional(),
  price: minorUnits,
  ...discountFields,
  currency: z.literal("INR").default("INR"),
  taxCategory: z.string().max(40).default("standard"),
  taxRateBps: z.number().int().min(0).max(10000).default(0),
  trackInventory: z.boolean().default(true),
  stockQuantity: z.number().int().min(0).max(1_000_000).default(0),
  lowStockThreshold: z.number().int().min(0).max(10000).default(5),
  backorderPolicy: z.enum(["deny", "allow"]).default("deny"),
  weightGrams: z.number().min(0).optional(),
  dimensionsCm: z.object({ length: z.number().min(0), width: z.number().min(0), height: z.number().min(0) }).optional(),
  isFeatured: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),
  isVisible: z.boolean().default(true),
  seoTitle: z.string().max(120).optional(),
  seoDescription: z.string().max(320).optional(),
});

export const createProductSchema = base.strict();
// reservedQuantity is intentionally NOT updatable - it is only changed by the atomic stock functions.
export const updateProductSchema = base.partial().strict();

export const productListQuery = pagination
  .extend({
    category: slug.optional(),
    brand: z.string().trim().min(1).max(80).optional(),
    compatibility: z.enum(["dog", "cat"]).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    inStock: boolish.optional(),
    featured: boolish.optional(),
    sort: z.enum(["newest", "price_asc", "price_desc", "featured"]).default("newest"),
  })
  .strict();

export type CreateProductInput = z.input<typeof createProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type ProductListQuery = z.output<typeof productListQuery>;
export { objectId };
