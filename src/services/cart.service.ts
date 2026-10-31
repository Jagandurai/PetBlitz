import { Types } from "mongoose";
import { z } from "zod";
import { addCartItemSchema, setQuantitySchema, checkoutSchema, couponPreviewSchema } from "@/validations/cart.validation";
import { connectDB } from "@/lib/db/connection";
import { AppError, conflict, notFound, unprocessable } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { computeStockStatus } from "@/lib/inventory";
import { Cart } from "@/models/Store";
import { Pet } from "@/models/Pet";
import { Product } from "@/models/Product";
import { createOrder } from "./order.service";
import { getPublicCategoryIds } from "./category.service";
import { evaluateCoupon } from "./coupon.service";


const MAX_LINES = 50;

/** Live-priced view of the cart. Prices/availability always come from the catalog, never from stored cart data. */
export async function getCart(customerId: string) {
  await connectDB();
  const cart = await Cart.findOne({ customerId: toObjectId(customerId) }).lean();
  const eligible = await getPublicCategoryIds();
  const petIds = (cart?.items ?? []).filter((i) => i.petId).map((i) => i.petId!);
  const prodIds = (cart?.items ?? []).filter((i) => i.productId).map((i) => i.productId!);
  const [pets, prods] = await Promise.all([Pet.find({ _id: { $in: petIds } }).lean(), Product.find({ _id: { $in: prodIds } }).lean()]);
  const petMap = new Map(pets.map((p) => [String(p._id), p])), prodMap = new Map(prods.map((p) => [String(p._id), p]));
  const lines = (cart?.items ?? []).map((i) => {
    if (i.itemType === "pet") {
      const p = petMap.get(String(i.petId));
      const ok = !!p && p.status === "published" && p.isVisible && ["available"].includes(p.availabilityStatus) && eligible.has(String(p.categoryId));
      return { key: i.key, itemType: "pet" as const, id: String(i.petId), quantity: 1, name: p?.name ?? "Unavailable pet", slug: p?.slug, image: p?.media?.find((m) => m.isPrimary)?.url ?? p?.media?.[0]?.url, unitPrice: p?.finalPrice ?? 0, listPrice: p?.price ?? 0, lineTotal: p?.finalPrice ?? 0, available: ok, maxQuantity: 1, issue: ok ? undefined : p?.availabilityStatus === "reserved" ? "Reserved by another customer" : "No longer available" };
    }
    const p = prodMap.get(String(i.productId));
    const stock = p ? computeStockStatus({ trackInventory: p.trackInventory, stockQuantity: p.stockQuantity, reservedQuantity: p.reservedQuantity, lowStockThreshold: p.lowStockThreshold, backorderPolicy: p.backorderPolicy as "deny" | "allow" }) : null;
    const max = !p ? 0 : !p.trackInventory || p.backorderPolicy === "allow" ? 100 : Math.min(100, stock!.availableQuantity);
    const ok = !!p && p.status === "published" && p.isVisible && eligible.has(String(p.categoryId)) && max >= i.quantity;
    return { key: i.key, itemType: "product" as const, id: String(i.productId), quantity: i.quantity, name: p?.name ?? "Unavailable product", slug: p?.slug, image: p?.media?.find((m) => m.isPrimary)?.url ?? p?.media?.[0]?.url, unitPrice: p?.finalPrice ?? 0, listPrice: p?.price ?? 0, lineTotal: (p?.finalPrice ?? 0) * i.quantity, available: ok, maxQuantity: max, issue: ok ? undefined : max === 0 ? "Out of stock" : `Only ${max} left` };
  });
  const subtotal = lines.filter((l) => l.available).reduce((a, l) => a + l.lineTotal, 0);
  return { items: lines, itemCount: lines.reduce((a, l) => a + l.quantity, 0), subtotal, currency: "INR", hasIssues: lines.some((l) => !l.available), note: "Shipping, tax and coupons are calculated at checkout." };
}

export async function addToCart(customerId: string, input: z.input<typeof addCartItemSchema>) {
  await connectDB();
  const d = addCartItemSchema.parse(input);
  const cid = toObjectId(customerId);
  const id = d.itemType === "pet" ? d.petId : d.productId;
  const key = `${d.itemType}:${id}`;
  if (d.itemType === "pet") { if (!(await Pet.exists({ _id: d.petId, status: "published", isVisible: true, availabilityStatus: "available" }))) throw conflict("ITEM_UNAVAILABLE", "This pet is no longer available"); }
  else if (!(await Product.exists({ _id: d.productId, status: "published", isVisible: true }))) throw notFound("Product");
  const qty = d.itemType === "pet" ? 1 : d.quantity;
  // 1) bump an existing line (atomic, capped at 100); 2) else push a new line only while under the line limit.
  const bumped = d.itemType === "product" ? await Cart.updateOne({ customerId: cid, "items.key": key, "items.quantity": { $lte: 100 - qty } }, { $inc: { "items.$.quantity": qty } }) : { matchedCount: 0 };
  if (!bumped.matchedCount) {
    if (await Cart.exists({ customerId: cid, "items.key": key })) { if (d.itemType === "pet") return getCart(customerId); throw unprocessable("QUANTITY_LIMIT", "Maximum quantity per item is 100"); }
    await Cart.updateOne({ customerId: cid }, { $setOnInsert: { customerId: cid } }, { upsert: true });
    const pushed = await Cart.updateOne({ customerId: cid, [`items.${MAX_LINES - 1}`]: { $exists: false }, "items.key": { $ne: key } }, { $push: { items: { key, itemType: d.itemType, ...(d.itemType === "pet" ? { petId: new Types.ObjectId(d.petId) } : { productId: new Types.ObjectId(d.productId) }), quantity: qty } } });
    if (!pushed.modifiedCount && !(await Cart.exists({ customerId: cid, "items.key": key }))) throw unprocessable("CART_FULL", `A cart can hold up to ${MAX_LINES} different items`);
  }
  return getCart(customerId);
}

/** Change a PRODUCT line's quantity (pets are always 1). `id` = productId. */
export async function setCartQuantity(customerId: string, id: string, input: z.input<typeof setQuantitySchema>) {
  await connectDB();
  const { quantity } = setQuantitySchema.parse(input);
  const r = await Cart.updateOne({ customerId: toObjectId(customerId), "items.productId": toObjectId(id) }, { $set: { "items.$.quantity": quantity } });
  if (!r.matchedCount) throw notFound("Cart item");
  return getCart(customerId);
}

/** Remove a line by its pet id or product id. */
export async function removeFromCart(customerId: string, id: string) {
  await connectDB();
  const oid = toObjectId(id);
  await Cart.updateOne({ customerId: toObjectId(customerId) }, { $pull: { items: { $or: [{ petId: oid }, { productId: oid }] } } });
  return getCart(customerId);
}
export async function clearCart(customerId: string) { await connectDB(); await Cart.updateOne({ customerId: toObjectId(customerId) }, { $set: { items: [] } }); }

/** What would this coupon take off the current cart? (Final validation + redemption happen again, atomically, at checkout.) */
export async function previewCoupon(customerId: string, input: z.input<typeof couponPreviewSchema>) {
  const { code } = couponPreviewSchema.parse(input);
  const cart = await getCart(customerId);
  const lines = cart.items.filter((l) => l.available);
  if (!lines.length) throw unprocessable("CART_EMPTY", "Your cart is empty");
  const ev = await evaluateCoupon(code, toObjectId(customerId), lines.map((l) => ({ kind: l.itemType, base: l.lineTotal })));
  return { code: ev.coupon.code, description: ev.coupon.description, discount: ev.discount };
}

/** Creates the order from the cart (same server-side pricing as POST /me/orders) and removes exactly the ordered lines. */
export async function checkoutCart(customerId: string, input: z.input<typeof checkoutSchema>) {
  await connectDB();
  const d = checkoutSchema.parse(input);
  const cart = await Cart.findOne({ customerId: toObjectId(customerId) }).lean();
  if (!cart?.items.length) throw unprocessable("CART_EMPTY", "Your cart is empty");
  const items = cart.items.map((i) => (i.itemType === "pet" ? { itemType: "pet" as const, petId: String(i.petId), quantity: 1 as const } : { itemType: "product" as const, productId: String(i.productId), quantity: i.quantity }));
  const r = await createOrder(customerId, { items, shippingAddressId: d.shippingAddressId, billingAddressId: d.billingAddressId, couponCode: d.couponCode, customerNote: d.customerNote, idempotencyKey: d.idempotencyKey });
  const keys = cart.items.map((i) => i.key);
  await Cart.updateOne({ customerId: toObjectId(customerId) }, { $pull: { items: { key: { $in: keys } } } }); // lines added meanwhile survive
  return r;
}
export { AppError };
