import { describe, expect, it } from "vitest";
import { can, permissionFor } from "@/lib/auth/rbac";
import { currentBySlot, StoredBanner, toBannerSlot } from "@/services/banner.service";
import { homeCategories } from "@/services/homepage.service";
import { bannerSchema, bannerSlotSchema } from "@/validations/homepage.validation";

const url = "https://res.cloudinary.com/demo/image/upload/v1/a.jpg";
const empty = { heading: "", paragraph: "", imageUrl: "", imageKey: "" };
const old = (_id: string, slot: number, order: number, extra: Record<string, unknown> = {}) =>
  ({ _id, slot, isActive: true, live: { slot, order, startsAt: null, endsAt: null, design: { content: { heading: "Big", highlight: "sale", paragraph: "Today" }, images: { desktop: { url, storageKey: "k" } } } }, ...extra }) as unknown as StoredBanner;

describe("banner validation", () => {
  it("accepts only heading, paragraph and a Cloudinary image; text is optional", () => {
    expect(bannerSchema.parse({ ...empty, imageUrl: url })).toMatchObject({ heading: "", imageUrl: url });
    expect(bannerSchema.parse({ ...empty, heading: " <b>x</b>\u0007 " }).heading).toBe("<b>x</b>");
    for (const bad of [{ ...empty, imageUrl: "https://evil.example/a.jpg" }, { ...empty, imageUrl: "javascript:alert(1)" }, { ...empty, color: "red" }, { ...empty, heading: "x".repeat(201) }]) expect(bannerSchema.safeParse(bad).success).toBe(false);
    for (const bad of [0, 5, "x"]) expect(bannerSlotSchema.safeParse(bad).success).toBe(false);
  });
});

describe("one banner per slot", () => {
  it("picks the old banner that was shown first and ignores ones that were not shown", () => {
    const rows = [old("second", 1, 20), old("first", 1, 10), old("off", 2, 1, { isActive: false }), old("draft", 3, 1, { live: null })];
    const current = currentBySlot(rows);
    expect(current.get(1)!._id).toBe("first");
    expect([...current.keys()]).toEqual([1]);
  });
  it("respects the old schedule", () => {
    const later = old("later", 4, 1);
    later.live!.startsAt = "2999-01-01T00:00:00Z";
    expect(currentBySlot([later]).size).toBe(0);
  });
  it("prefers a saved banner over an old one, even when it was emptied", () => {
    const saved = { _id: "new", slot: 1, ...empty } as unknown as StoredBanner;
    expect(currentBySlot([saved, old("old", 1, 1)]).get(1)!._id).toBe("new");
  });
  it("keeps the old heading, paragraph and image", () => {
    expect(toBannerSlot(1, old("a", 1, 1))).toMatchObject({ heading: "Big sale", paragraph: "Today", imageUrl: url, imageKey: "k" });
    expect(toBannerSlot(2)).toMatchObject({ slot: 2, ...empty });
  });
});

describe("shop by category", () => {
  it("always shows the five categories and links to the matching public category", () => {
    const list = homeCategories(new Set(["grooming", "grooming-essentials", "interactive-toys", "litter"]));
    expect(list.map((c) => c.name)).toEqual(["Grooming", "Toys", "Cat Litter", "Hygiene", "Clothing & Accessories"]);
    expect(list.map((c) => c.href)).toEqual(["/products?category=grooming", "/products?category=interactive-toys", "/products?category=litter", "/products", "/products"]);
  });
});

describe("permissions", () => {
  it("lets catalogue admins edit banners but not support staff", () => {
    expect(permissionFor("GET", "/api/admin/banners")).toBe("catalog.read");
    expect(permissionFor("PUT", "/api/admin/banners/1")).toBe("marketing.write");
    expect(can("catalog", "marketing.write")).toBe(true);
    expect(can("support", "marketing.write")).toBe(false);
  });
});
