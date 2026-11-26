/**
 * The single source for storefront image shapes. The banner grid and blog covers take their proportions from here,
 * and the admin cropper builds its frames and previews from the same numbers.
 */

/** Promotional mosaic. Desktop is measured at the full 1240px content width. Ratios are width / height. */
export const BANNER_LAYOUT = {
  width: 1240,
  height: 600,
  gap: 12,
  columns: [5, 4, 3] as const,
  /** Phones (container under 600px). Banners 2–4 are full width in their desktop shapes, so artwork is not cut off. */
  mobile: [4 / 5, 405 / 294, 304 / 294, 721 / 294] as const,
  /** Tablets. Banner 1 has no entry: it spans both rows, so its height follows banners 2 and 3. */
  tablet: { side: 4 / 3, wide: 21 / 9 },
};

export const BLOG_LAYOUT = {
  /** Article page cover. */
  cover: 16 / 9,
  /** Listing, featured and related-article cards. */
  thumbnail: 16 / 10,
};

export type PresetKey = "PROMO_LARGE_LEFT" | "PROMO_UPPER_MIDDLE" | "PROMO_UPPER_RIGHT" | "PROMO_BOTTOM_WIDE" | "BLOG_COVER" | "BLOG_THUMBNAIL";
export interface Size { width: number; height: number }
export interface CropPreset {
  usage: "banner" | "blog";
  /** Largest file produced. About twice the largest desktop size, for sharp high-density screens. */
  output: Size;
  /** Desktop size on screen: below this the picture is stretched even on ordinary screens. */
  minimum: Size;
  aspect: number;
  /** How the cropped picture is shown on the site: each frame centre-crops it, exactly as the storefront CSS does. */
  previews: { label: string; aspect: number }[];
}

const { width, height, gap, columns, mobile } = BANNER_LAYOUT;
const unit = (width - gap * 2) / (columns[0] + columns[1] + columns[2]);
const row = (height - gap) / 2;

function preset(usage: CropPreset["usage"], shown: Size, others: CropPreset["previews"], firstLabel: string): CropPreset {
  const minimum = { width: Math.round(shown.width), height: Math.round(shown.height) };
  const output = { width: minimum.width * 2, height: minimum.height * 2 };
  const aspect = output.width / output.height;
  return { usage, output, minimum, aspect, previews: [{ label: firstLabel, aspect }, ...others] };
}
const banner = (slot: number, w: number, h: number) => preset("banner", { width: w, height: h }, [{ label: "Mobile", aspect: mobile[slot]! }], "Desktop");

export const CROP_PRESETS: Record<PresetKey, CropPreset> = {
  PROMO_LARGE_LEFT: banner(0, unit * columns[0], height),
  PROMO_UPPER_MIDDLE: banner(1, unit * columns[1], row),
  PROMO_UPPER_RIGHT: banner(2, unit * columns[2], row),
  PROMO_BOTTOM_WIDE: banner(3, unit * (columns[1] + columns[2]) + gap, row),
  // one upload serves both blog shapes: cards centre-crop the saved cover
  BLOG_COVER: preset("blog", { width: 800, height: 800 / BLOG_LAYOUT.cover }, [{ label: "Blog listing card", aspect: BLOG_LAYOUT.thumbnail }], "Article page"),
  BLOG_THUMBNAIL: preset("blog", { width: 640, height: 640 / BLOG_LAYOUT.thumbnail }, [], "Blog listing card"),
};

export const BANNER_PRESETS: PresetKey[] = ["PROMO_LARGE_LEFT", "PROMO_UPPER_MIDDLE", "PROMO_UPPER_RIGHT", "PROMO_BOTTOM_WIDE"];

export interface Area { x: number; y: number; width: number; height: number }

/** The part of `area` that stays visible when it fills a frame of `aspect` (CSS object-fit: cover, centred). */
export function coverRegion(area: Area, aspect: number): Area {
  const w = Math.min(area.width, area.height * aspect), h = w / aspect;
  return { x: area.x + (area.width - w) / 2, y: area.y + (area.height - h) / 2, width: w, height: h };
}

/** File size in pixels for a crop: never larger than the preset, and never upscaled. */
export function outputSize(crop: Size, p: CropPreset): Size {
  const w = Math.max(1, Math.round(Math.min(crop.width, p.output.width)));
  return { width: w, height: Math.max(1, Math.round(w / p.aspect)) };
}

export function resolutionWarning(crop: Size, p: CropPreset): string {
  // two pixels of slack: the cropper rounds its crop area
  if (crop.width + 2 >= p.output.width) return "";
  const where = p.usage === "banner" ? "banner" : "cover";
  return crop.width < p.minimum.width
    ? `This image will appear blurry at the recommended ${where} size. Please upload a higher-resolution image or zoom out.`
    : `This image may appear blurry at the recommended ${where} size on sharp screens. Please upload a higher-resolution image or zoom out.`;
}
