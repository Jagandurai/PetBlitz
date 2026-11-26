import { describe, expect, it } from "vitest";
import { BANNER_PRESETS, BLOG_LAYOUT, CROP_PRESETS, coverRegion, outputSize, resolutionWarning } from "@/lib/ui/image-presets";

describe("crop presets", () => {
  it("match the storefront containers, one shape per banner position", () => {
    expect(BANNER_PRESETS.map((k) => CROP_PRESETS[k].output)).toEqual([{ width: 1014, height: 1200 }, { width: 810, height: 588 }, { width: 608, height: 588 }, { width: 1442, height: 588 }]);
    expect(new Set(BANNER_PRESETS.map((k) => CROP_PRESETS[k].aspect.toFixed(2))).size).toBe(4);
    expect(CROP_PRESETS.BLOG_COVER.output).toEqual({ width: 1600, height: 900 });
    expect(CROP_PRESETS.BLOG_COVER.previews.map((p) => p.aspect)).toEqual([CROP_PRESETS.BLOG_COVER.aspect, BLOG_LAYOUT.thumbnail]);
  });
  it("never upscales and keeps the exact shape", () => {
    const p = CROP_PRESETS.BLOG_COVER;
    expect(outputSize({ width: 6000, height: 3375 }, p)).toEqual({ width: 1600, height: 900 });
    expect(outputSize({ width: 800, height: 450 }, p)).toEqual({ width: 800, height: 450 });
  });
  it("warns only when the cropped area is smaller than recommended", () => {
    const p = CROP_PRESETS.BLOG_COVER;
    expect(resolutionWarning({ width: 1599, height: 899 }, p)).toBe("");
    expect(resolutionWarning({ width: 1000, height: 563 }, p)).toMatch(/may appear blurry/);
    expect(resolutionWarning({ width: 500, height: 281 }, p)).toMatch(/will appear blurry/);
  });
  it("centre-crops like object-fit: cover", () => {
    expect(coverRegion({ x: 10, y: 20, width: 160, height: 90 }, 1)).toEqual({ x: 45, y: 20, width: 90, height: 90 });
    expect(coverRegion({ x: 0, y: 0, width: 90, height: 90 }, 2)).toEqual({ x: 0, y: 22.5, width: 90, height: 45 });
  });
});
