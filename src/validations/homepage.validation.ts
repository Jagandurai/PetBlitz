import { z } from "zod";

// ---------------------------------------------------------------- promotional banners
// Text is only ever rendered by React (never as HTML).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const text = (max: number) => z.string().max(max).transform((v) => v.replace(CONTROL, "").trim());
/** Only the project's image host is accepted (it is also the only one the production security policy allows). */
const IMAGE_URL = /^https:\/\/res\.cloudinary\.com\/[^\s"'<>\\]+$/;

export const BANNER_SLOTS = [1, 2, 3, 4] as const;
export const BANNER_LIMITS = { heading: 200, paragraph: 300 } as const;
export const bannerSlotSchema = z.coerce.number().int().min(1).max(4);
export const bannerSchema = z.object({
  heading: text(BANNER_LIMITS.heading),
  paragraph: text(BANNER_LIMITS.paragraph),
  imageUrl: z.string().max(2048).regex(IMAGE_URL, "upload the image (only Cloudinary images can be shown)").or(z.literal("")),
  imageKey: z.string().max(512),
}).strict();
export type BannerInput = z.infer<typeof bannerSchema>;

// ---------------------------------------------------------------- recently viewed
export const homeProductsQuery = z.object({ ids: z.string().max(520).regex(/^[a-f\d]{24}(,[a-f\d]{24}){0,19}$/i, "invalid ids") }).strict();
