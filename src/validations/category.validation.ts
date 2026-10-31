import { z } from "zod";
import { imageInput, objectId, slug } from "./common";

const type = z.enum(["dog", "cat", "accessory"]);

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: slug.optional(),
    description: z.string().max(2000).optional(),
    type: type.optional(), // required for root; children inherit the parent's type
    parentId: objectId.nullish(),
    image: imageInput.optional(),
    icon: z.string().max(100).optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
    isActive: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    seoTitle: z.string().max(120).optional(),
    seoDescription: z.string().max(320).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.parentId && !v.type) ctx.addIssue({ code: "custom", path: ["type"], message: "type is required for root categories" });
  });

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug,
    description: z.string().max(2000).nullable(),
    type,
    image: imageInput.nullable(),
    icon: z.string().max(100).nullable(),
    isFeatured: z.boolean(),
    seoTitle: z.string().max(120).nullable(),
    seoDescription: z.string().max(320).nullable(),
  })
  .partial()
  .strict();

export const categoryQuerySchema = z.object({ slug: slug.optional(), flat: z.enum(["true", "false"]).optional() }).strict();

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
