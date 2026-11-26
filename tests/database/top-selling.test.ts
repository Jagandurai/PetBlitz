import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanDb, HAS_DB, makeUniqueCats, media, setupDb, teardownDb } from "../helpers";
import { Product } from "@/models/Product";
import { getPublicHomeData } from "@/services/homepage.service";
import { createProduct, getPublicProductBySlug, listPublicProducts, setProductPublication, updateProduct } from "@/services/product.service";

describe.skipIf(!HAS_DB)("top selling and featured (PetBlitzTest)", () => {
  beforeAll(setupDb, 30000);
  beforeEach(cleanDb, 30000);
  afterAll(teardownDb);

  const make = async () => {
    const { toys } = await makeUniqueCats();
    const p = await createProduct({ name: "Rope toy", sku: "ROPE" + Math.random().toString(36).slice(2, 6), categoryId: toys.id, compatibility: ["dog"], price: 10000, stockQuantity: 3, description: "A sturdy test accessory.", media });
    await setProductPublication(String(p._id), "published");
    return String(p._id);
  };
  const stored = async (id: string) => (await Product.collection.findOne({ _id: new (Product.base.Types.ObjectId)(id) }))!;

  it("is saved, shown publicly, kept by unrelated edits and can be switched off", async () => {
    const id = await make();
    expect((await stored(id)).isTopSelling).toBe(false);
    await updateProduct(id, { isTopSelling: true });
    expect((await stored(id)).isTopSelling).toBe(true);
    await updateProduct(id, { name: "Rope toy XL" });
    expect((await stored(id)).isTopSelling).toBe(true);
    const slug = (await stored(id)).slug as string;
    expect((await getPublicProductBySlug(slug)).isTopSelling).toBe(true);
    expect((await listPublicProducts({})).items[0]!.isTopSelling).toBe(true);
    expect((await getPublicHomeData()).newArrivals[0]!.isTopSelling).toBe(true);
    await updateProduct(id, { isTopSelling: false });
    expect((await getPublicProductBySlug(slug)).isTopSelling).toBe(false);
  });

  it("featured products appear only while featured, visible and published", async () => {
    const id = await make();
    const names = async () => (await getPublicHomeData()).featured.map((p) => p.name);
    expect(await names()).toEqual([]);
    await updateProduct(id, { isFeatured: true });
    expect(await names()).toEqual(["Rope toy"]);
    await updateProduct(id, { isVisible: false });
    expect(await names()).toEqual([]);
    await updateProduct(id, { isVisible: true });
    await setProductPublication(id, "archived");
    expect(await names()).toEqual([]);
  });
});
