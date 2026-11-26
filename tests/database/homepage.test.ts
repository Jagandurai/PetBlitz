import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanDb, HAS_DB, makeUniqueCats, media, setupDb, teardownDb } from "../helpers";
import { Banner } from "@/models/Banner";
import { Product } from "@/models/Product";
import { getBannerSlots, saveBanner } from "@/services/banner.service";
import * as H from "@/services/homepage.service";
import { createProduct, setProductPublication } from "@/services/product.service";

const url = "https://res.cloudinary.com/demo/image/upload/v1/a.jpg";
const input = (heading: string, imageUrl = "") => ({ heading, paragraph: "", imageUrl, imageKey: "" });

async function product(categoryId: string, name: string, publishedAt?: Date) {
  const p = await createProduct({ name, sku: name.replace(/\W/g, "") + Math.random().toString(36).slice(2, 6), categoryId, compatibility: ["dog"], price: 10000, stockQuantity: 3, description: "A sturdy test accessory.", media });
  if (publishedAt) { await setProductPublication(String(p._id), "published"); await Product.updateOne({ _id: p._id }, { publishedAt }); }
  return String(p._id);
}

describe.skipIf(!HAS_DB)("homepage (PetBlitzTest)", () => {
  beforeAll(setupDb, 30000);
  beforeEach(cleanDb, 30000);
  afterAll(teardownDb);

  it("saves each banner independently and keeps one record per slot", async () => {
    await saveBanner(1, input("One"));
    await saveBanner(3, input("", url));
    await saveBanner(1, input("One again"));
    expect((await getBannerSlots()).map((b) => [b.slot, b.heading, b.imageUrl])).toEqual([[1, "One again", ""], [2, "", ""], [3, "", url], [4, "", ""]]);
    expect(await Banner.countDocuments()).toBe(2);
  });

  it("updates an old advanced banner in place without removing its data", async () => {
    await Banner.collection.insertOne({ name: "Old", slot: 2, isActive: true, live: { slot: 2, order: 10, design: { content: { heading: "Before" }, images: { desktop: { url } } } } });
    expect((await getBannerSlots())[1]).toMatchObject({ heading: "Before", imageUrl: url });
    await saveBanner(2, input("After", url));
    const rows = await Banner.collection.find().toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Old", heading: "After", live: { slot: 2 } });
  });

  it("new arrivals and history never expose draft or archived products", async () => {
    const { toys } = await makeUniqueCats();
    const older = await product(toys.id, "Older", new Date("2026-01-01")), newer = await product(toys.id, "Newer", new Date("2026-03-01")), draft = await product(toys.id, "Draft");
    const gone = await product(toys.id, "Archived", new Date("2026-04-01"));
    await setProductPublication(gone, "archived");
    expect((await H.getPublicHomeData()).newArrivals.map((p) => p.name)).toEqual(["Newer", "Older"]);
    expect((await H.getPublicProductsByIds([older, draft, gone, newer])).map((p) => p.name)).toEqual(["Older", "Newer"]);
  });
});
