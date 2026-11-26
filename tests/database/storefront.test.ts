import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanDb, HAS_DB, makeCats, setupDb, teardownDb } from "../helpers";
import { customer, publishedProduct } from "./fixtures";
import { Order } from "@/models/Order";
import { _clearSettingsCache, updateSettings } from "@/services/settings.service";
import * as Cart from "@/services/cart.service";
import * as Coup from "@/services/coupon.service";
import * as Cat from "@/services/catalog.service";
import * as Prod from "@/services/product.service";

describe.skipIf(!HAS_DB)("storefront: quote, facets, filters, search (PetBlitzTest)", () => {
  beforeAll(setupDb, 30000); beforeEach(async () => { await cleanDb(); _clearSettingsCache(); }); afterAll(teardownDb);

  it("the cart QUOTE equals the order total that checkout then creates (exclusive and inclusive GST, coupon, shipping rules)", async () => {
    for (const inclusive of [false, true]) {
      await cleanDb(); _clearSettingsCache();
      const { toys } = await makeCats();
      const prod = await publishedProduct(toys.id, 20, { taxRateBps: 1800, price: 99900, discountType: "percent", discountValue: 10 });
      const c = await customer();
      await updateSettings({ shipping: { baseFeeMinor: 6000, freeAboveMinor: 500000, stateFees: { "33": 4000 } }, tax: { pricesIncludeTax: inclusive, sellerStateCode: "33" } }, "t");
      await Coup.createCoupon({ code: "SAVE10", type: "percent", value: 10, minOrderMinor: 0, appliesTo: "all", perCustomerLimit: 1, isActive: true }, "t");
      await Cart.addToCart(c.id, { itemType: "product", productId: String(prod._id), quantity: 3 });
      const q = await Cart.quoteCart(c.id, { shippingAddressId: c.addressId, couponCode: "save10" });
      expect(q.couponCode).toBe("SAVE10");
      expect(q.pricesIncludeTax).toBe(inclusive);
      const placed = await Cart.checkoutCart(c.id, { shippingAddressId: c.addressId, couponCode: "SAVE10", idempotencyKey: `quote-key-${inclusive}-12345` });
      const o = (await Order.findById((placed.order as unknown as { _id: string })._id).lean())!;
      expect(o.grandTotal).toBe(q.grandTotal);
      expect(o.shippingTotal).toBe(q.shippingTotal);
      expect(o.taxTotal).toBe(q.taxTotal);
      expect(o.couponDiscount).toBe(q.couponDiscount);
    }
  });

  it("quote reports bad coupons and unavailable items without failing; empty cart quotes zero", async () => {
    const { toys } = await makeCats();
    const prod = await publishedProduct(toys.id, 1);
    const c = await customer();
    expect((await Cart.quoteCart(c.id, {})).grandTotal).toBe(0);
    await Cart.addToCart(c.id, { itemType: "product", productId: String(prod._id), quantity: 1 });
    expect((await Cart.quoteCart(c.id, { couponCode: "NOPE" })).couponError).toMatch(/not valid/i);
    await Prod.adjustStock(String(prod._id), { mode: "set", value: 0 });
    const q = await Cart.quoteCart(c.id, {});
    expect(q.hasIssues).toBe(true);
    expect(q.lines).toHaveLength(0);
  });

  it("free-shipping progress reflects the threshold", async () => {
    const { toys } = await makeCats();
    const prod = await publishedProduct(toys.id, 10, { price: 100000 });
    const c = await customer();
    await updateSettings({ shipping: { baseFeeMinor: 6000, freeAboveMinor: 250000 } }, "t");
    await Cart.addToCart(c.id, { itemType: "product", productId: String(prod._id), quantity: 1 });
    expect(await Cart.quoteCart(c.id, {})).toMatchObject({ freeShippingRemaining: 150000, shippingTotal: 6000 });
    await Cart.setCartQuantity(c.id, String(prod._id), { quantity: 3 });
    expect(await Cart.quoteCart(c.id, {})).toMatchObject({ freeShippingRemaining: 0, shippingTotal: 0 });
  });

  it("facets are computed from live data (compatibility, brands, price range, on-sale) and respect category scope", async () => {
    const { toys } = await makeCats();
    await publishedProduct(toys.id, 5, { brand: "Pedigree", price: 50000 });
    await publishedProduct(toys.id, 5, { brand: "Pedigree", price: 80000, discountType: "fixed", discountValue: 10000 });
    await publishedProduct(toys.id, 5, { brand: "Whiskas", price: 120000 });
    const p = await Cat.getFacets({ kind: "products" });
    expect(p.brands!.find((b) => b.value === "Pedigree")!.count).toBe(2);
    expect(p.priceRange).toEqual({ min: 50000, max: 120000 });
    expect(p.onSale).toBe(1);
    expect(p.animals).toEqual([{ value: "dog", count: 3 }]);
    expect((await Cat.getFacets({ kind: "products", category: "brushes" })).total).toBe(0); // category scoping
  });

  it("filters: multi-brand, on-sale, in-stock", async () => {
    const { toys } = await makeCats();
    await publishedProduct(toys.id, 5, { brand: "Pedigree", price: 50000 });
    await publishedProduct(toys.id, 5, { brand: "Whiskas", price: 60000, discountType: "percent", discountValue: 10 });
    await publishedProduct(toys.id, 0, { brand: "Royal Canin", price: 70000 });
    const names = async (q: Record<string, unknown>) => (await Prod.listPublicProducts(q)).items.map((i) => i.brand).sort();
    expect(await names({ brand: "pedigree,whiskas" })).toEqual(["Pedigree", "Whiskas"]);
    expect(await names({ onSale: "true" })).toEqual(["Whiskas"]);
    expect(await names({ inStock: "true" })).toEqual(["Pedigree", "Whiskas"]);
    expect(await names({ inStock: "true", onSale: "true" })).toEqual(["Whiskas"]);
  });

  it("text search ranks by relevance and falls back safely", async () => {
    const { toys } = await makeCats();
    await publishedProduct(toys.id, 5, { name: "Rope Chew Toy", brand: "Kong", description: "Durable rope for chewing and tug games" });
    await publishedProduct(toys.id, 5, { name: "Squeaky Ball", brand: "Kong", description: "A ball that squeaks, loved by dogs" });
    expect((await Prod.listPublicProducts({ q: "rope" })).items.map((i) => i.name)).toEqual(["Rope Chew Toy"]);
    expect((await Prod.listPublicProducts({ q: "kong" })).items).toHaveLength(2);
    expect((await Prod.listPublicProducts({ q: "a.b(c" })).items).toHaveLength(0); // regex metacharacters are harmless
  });
});
