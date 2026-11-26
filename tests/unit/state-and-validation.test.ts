import { describe, expect, it } from "vitest";
import { ORDER_TRANSITIONS, assertTransition, canTransition } from "@/services/order.service";
import { computeStockStatus } from "@/lib/inventory";
import { createOrderSchema } from "@/validations/order.validation";
import { customerSelfUpdateSchema } from "@/validations/customer.validation";
import { createProductSchema } from "@/validations/product.validation";
import { createReviewSchema } from "@/validations/review.validation";
import { contactSchema } from "@/validations/message.validation";
import { createCategorySchema } from "@/validations/category.validation";
import { productListQuery } from "@/validations/product.validation";
import { addCartItemSchema } from "@/validations/cart.validation";
import { requireAdmin } from "@/lib/auth/guards";

const id = "507f1f77bcf86cd799439011";

describe("order transitions", () => {
  it("allows the happy path and rejects invalid jumps", () => {
    expect(canTransition("placed", "accepted")).toBe(true);
    expect(canTransition("delivered", "refund_initiated")).toBe(true);
    expect(() => assertTransition("placed", "delivered")).toThrow();
    expect(() => assertTransition("refunded", "placed")).toThrow();
    expect(() => assertTransition("dispatched", "cancelled")).toThrow();
    expect(() => assertTransition("accepted", "dispatched")).toThrow(); // no skipping
    expect(() => assertTransition("packed", "accepted")).toThrow(); // no going back
    expect(ORDER_TRANSITIONS.refunded).toEqual([]);
  });
});

describe("validation", () => {
  it("rejects negative prices on products", () => {
    const base = { name: "Ball", sku: "BALL-1", categoryId: id, compatibility: ["dog"] };
    expect(createProductSchema.safeParse({ ...base, price: -1 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, price: 100 }).success).toBe(true);
  });
  it("rejects negative stock and unknown fields on products", () => {
    const base = { name: "Ball", sku: "BALL-1", categoryId: id, compatibility: ["dog"], price: 100 };
    expect(createProductSchema.safeParse({ ...base, stockQuantity: -1 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, reservedQuantity: 5 }).success).toBe(false);
  });
  it("orders: no client-supplied totals; only products can be ordered or added to the cart", () => {
    const base = { shippingAddressId: id, idempotencyKey: "abcdefgh" };
    expect(createOrderSchema.safeParse({ ...base, items: [{ itemType: "product", productId: id, quantity: 2 }], grandTotal: 1 }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...base, items: [{ itemType: "product", productId: id, quantity: 0 }] }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...base, items: [{ itemType: "pet", petId: id }] }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...base, items: [{ itemType: "product", productId: id, quantity: 1 }] }).success).toBe(true);
    expect(addCartItemSchema.safeParse({ itemType: "pet", petId: id }).success).toBe(false);
  });
  it("customers cannot escalate privileges or change status", () => {
    expect(customerSelfUpdateSchema.safeParse({ status: "active" }).success).toBe(false);
    expect(customerSelfUpdateSchema.safeParse({ role: "admin" }).success).toBe(false);
    expect(customerSelfUpdateSchema.safeParse({ googleId: "x" }).success).toBe(false);
    expect(customerSelfUpdateSchema.safeParse({ firstName: "Asha" }).success).toBe(true);
  });
  it("reviews cannot carry a client verifiedPurchase flag", () => {
    expect(createReviewSchema.safeParse({ orderId: id, orderItemId: id, rating: 5, verifiedPurchase: true }).success).toBe(false);
    expect(createReviewSchema.safeParse({ orderId: id, orderItemId: id, rating: 6 }).success).toBe(false);
  });
  it("contact form: honeypot and size limits", () => {
    const ok = { name: "A", subject: "Hello", body: "A long enough message." };
    expect(contactSchema.safeParse(ok).success).toBe(true);
    expect(contactSchema.parse({ ...ok, email: "someone@else.com" })).not.toHaveProperty("email");
    expect(contactSchema.safeParse({ ...ok, website: "spam.com" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, body: "x".repeat(5001) }).success).toBe(false);
  });
  it("root categories require a type; names are free text (no enum of names)", () => {
    expect(createCategorySchema.safeParse({ name: "Reptiles & Birds" }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: "Reptiles & Birds", type: "accessory" }).success).toBe(true);
    expect(createCategorySchema.safeParse({ name: "Puppies", type: "dog" }).success).toBe(false);
  });
  it("query params: operators and oversized pages are rejected", () => {
    expect(productListQuery.safeParse({ pageSize: "500" }).success).toBe(false);
    expect(productListQuery.safeParse({ category: { $ne: "x" } }).success).toBe(false);
    expect(productListQuery.safeParse({ sort: "$where" }).success).toBe(false);
    expect(productListQuery.parse({}).pageSize).toBe(20);
  });
});

describe("inventory status", () => {
  it("derives availability", () => {
    const p = { trackInventory: true, stockQuantity: 10, reservedQuantity: 4, lowStockThreshold: 5, backorderPolicy: "deny" as const };
    expect(computeStockStatus(p)).toEqual({ availableQuantity: 6, stockStatus: "in_stock" });
    expect(computeStockStatus({ ...p, reservedQuantity: 6 }).stockStatus).toBe("low_stock");
    expect(computeStockStatus({ ...p, reservedQuantity: 10 }).stockStatus).toBe("out_of_stock");
  });
});

describe("admin guard", () => {
  it("rejects missing/wrong keys and accepts the right one", () => {
    const mk = (h?: string) => new Request("http://x", { headers: h ? { authorization: h } : {} });
    expect(() => requireAdmin(mk())).toThrow();
    expect(() => requireAdmin(mk("Bearer wrong"))).toThrow();
    expect(requireAdmin(mk(`Bearer ${process.env.ADMIN_API_KEY}`)).role).toBe("admin");
  });
});
