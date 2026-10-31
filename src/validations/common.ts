import { z } from "zod";

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "invalid id");
export const slug = z.string().min(1).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "invalid slug");
export const minorUnits = z.number().int().min(0).max(1_000_000_00); // up to 1,000,000.00
const httpUrl = z.string().url().max(2048).refine((u) => /^https?:\/\//i.test(u), "must be http(s)");

export const imageInput = z.object({ url: httpUrl, alt: z.string().max(200).optional(), storageKey: z.string().max(512).optional() }).strict();
export const mediaInput = z
  .object({
    kind: z.enum(["image", "video"]),
    url: httpUrl,
    alt: z.string().max(200).optional(),
    storageKey: z.string().max(512).optional(),
    mimeType: z.string().max(100).optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict();

export const discountFields = {
  discountType: z.enum(["none", "percent", "fixed"]).default("none"),
  discountValue: z.number().min(0).default(0),
};

export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const boolish = z.enum(["true", "false"]).transform((v) => v === "true");
export type Page = z.infer<typeof pagination>;
export const pageMeta = (p: Page, total: number) => ({ page: p.page, pageSize: p.pageSize, total, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) });
