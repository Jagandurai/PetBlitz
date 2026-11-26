import { Types } from "mongoose";
import { z } from "zod";
import { quoteSchema, addCartItemSchema, setQuantitySchema, checkoutSchema, couponPreviewSchema } from "@/validations/cart.validation";
import { connectDB } from "@/lib/db/connection";
import { AppError, notFound, unprocessable } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { computeStockStatus } from "@/lib/inventory";
import { Cart } from "@/models/Store";
import { Product } from "@/models/Product";
import { createOrder } from "./order.service";
import { getPublicCategoryIds } from "./category.service";
import { evaluateCoupon } from "./coupon.service";
import { Customer } from "@/models/Customer";
import { allocate, computeLine, computeOrderTotals, computeShipping } from "@/lib/pricing";
import { stateCodeOf } from "@/lib/gst";
import { getSettings } from "./settings.service";


const MAX_LINES = 50;

/** Live-priced view of the cart. Prices/availability always come from the catalog, never from stored cart data. */
export async function getCart(customerId: string) {
  await connectDB();
  const cart = await Cart.findOne({ customerId: toObjectId(customerId) }).lean();
  const eligible = await getPublicCategoryIds();
  const items = (cart?.items ?? []).filter((i) => i.productId); // lines without a product (legacy data) are ignored
  const prods = await Product.find({ _id: { $in: items.map((i) => i.productId!) } }).lean();
  const prodMap = new Map(prods.map((p) => [String(p._id), p]));
  const lines = items.map((i) => {
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
  const key = `${d.itemType}:${d.productId}`;
  if (!(await Product.exists({ _id: d.productId, status: "published", isVisible: true }))) throw notFound("Product");
  const qty = d.quantity;
  // 1) bump an existing line (atomic, capped at 100); 2) else push a new line only while under the line limit.
  const bumped = await Cart.updateOne({ customerId: cid, "items.key": key, "items.quantity": { $lte: 100 - qty } }, { $inc: { "items.$.quantity": qty } });
  if (!bumped.matchedCount) {
    if (await Cart.exists({ customerId: cid, "items.key": key })) throw unprocessable("QUANTITY_LIMIT", "Maximum quantity per item is 100");
    await Cart.updateOne({ customerId: cid }, { $setOnInsert: { customerId: cid } }, { upsert: true });
    const pushed = await Cart.updateOne({ customerId: cid, [`items.${MAX_LINES - 1}`]: { $exists: false }, "items.key": { $ne: key } }, { $push: { items: { key, itemType: d.itemType, productId: new Types.ObjectId(d.productId), quantity: qty } } });
    if (!pushed.modifiedCount && !(await Cart.exists({ customerId: cid, "items.key": key }))) throw unprocessable("CART_FULL", `A cart can hold up to ${MAX_LINES} different items`);
  }
  return getCart(customerId);
}

/** Change a line's quantity. `id` = productId. */
export async function setCartQuantity(customerId: string, id: string, input: z.input<typeof setQuantitySchema>) {
  await connectDB();
  const { quantity } = setQuantitySchema.parse(input);
  const r = await Cart.updateOne({ customerId: toObjectId(customerId), "items.productId": toObjectId(id) }, { $set: { "items.$.quantity": quantity } });
  if (!r.matchedCount) throw notFound("Cart item");
  return getCart(customerId);
}

/** Remove a line by its product id. */
export async function removeFromCart(customerId: string, id: string) {
  await connectDB();
  const oid = toObjectId(id);
  await Cart.updateOne({ customerId: toObjectId(customerId) }, { $pull: { items: { productId: oid } } });
  return getCart(customerId);
}
export async function clearCart(customerId: string) { await connectDB(); await Cart.updateOne({ customerId: toObjectId(customerId) }, { $set: { items: [] } }); }

/** What would this coupon take off the current cart? (Final validation + redemption happen again, atomically, at checkout.) */
export async function previewCoupon(customerId: string, input: z.input<typeof couponPreviewSchema>) {
  const { code } = couponPreviewSchema.parse(input);
  const cart = await getCart(customerId);
  const lines = cart.items.filter((l) => l.available);
  if (!lines.length) throw unprocessable("CART_EMPTY", "Your cart is empty");
  const ev = await evaluateCoupon(code, toObjectId(customerId), lines.map((l) => ({ base: l.lineTotal })));
  return { code: ev.coupon.code, description: ev.coupon.description, discount: ev.discount };
}

/** Creates the order from the cart (same server-side pricing as POST /me/orders) and removes exactly the ordered lines. */
export async function checkoutCart(customerId: string, input: z.input<typeof checkoutSchema>) {
  await connectDB();
  const d = checkoutSchema.parse(input);
  const cart = await Cart.findOne({ customerId: toObjectId(customerId) }).lean();
  const ordered = (cart?.items ?? []).filter((i) => i.productId);
  if (!ordered.length) throw unprocessable("CART_EMPTY", "Your cart is empty");
  const items = ordered.map((i) => ({ itemType: "product" as const, productId: String(i.productId), quantity: i.quantity }));
  const r = await createOrder(customerId, { items, shippingAddressId: d.shippingAddressId, billingAddressId: d.billingAddressId, couponCode: d.couponCode, customerNote: d.customerNote, idempotencyKey: d.idempotencyKey });
  const keys = ordered.map((i) => i.key);
  await Cart.updateOne({ customerId: toObjectId(customerId) }, { $pull: { items: { key: { $in: keys } } } }); // lines added meanwhile survive
  return r;
}
export { AppError };

/**
 * EXACT price breakdown for the current cart BEFORE an order exists (what checkout shows): same pricing functions, tax mode,
 * coupon allocation and shipping rules as createOrder, so the quote equals the order total unless the cart or prices change in between.
 * Nothing is reserved or written.
 */
export async function quoteCart(customerId: string, input: z.input<typeof quoteSchema>) {
  await connectDB();
  const d = quoteSchema.parse(input);
  const cid = toObjectId(customerId);
  const [cart, settings] = await Promise.all([getCart(customerId), getSettings()]);
  const raw = await Cart.findOne({ customerId: cid }).lean();
  const usable = cart.items.filter((l) => l.available);
  const taxById = new Map<string, number>();
  const prods = await Product.find({ _id: { $in: usable.map((l) => toObjectId(l.id)) } }, { taxRateBps: 1 }).lean();
  for (const p of prods) taxById.set(String(p._id), p.taxRateBps ?? 0);
  void raw;
  const inclusive = settings.tax.pricesIncludeTax;
  const first = usable.map((l) => ({ l, input: { unitPrice: l.listPrice, unitDiscount: l.listPrice - l.unitPrice, quantity: l.quantity, taxRateBps: taxById.get(l.id) ?? 0, inclusive } }));
  const firstPass = first.map((x) => computeLine(x.input));
  let shares = firstPass.map(() => 0), couponCode: string | undefined, couponDiscount = 0, couponError: string | undefined;
  if (d.couponCode && usable.length) {
    try {
      const ev = await evaluateCoupon(d.couponCode, cid, first.map((_, i) => ({ base: firstPass[i]!.subtotal - firstPass[i]!.discountAmount })));
      shares = allocate(ev.discount, ev.eligible);
      couponCode = ev.coupon.code; couponDiscount = shares.reduce((a, b) => a + b, 0);
    } catch (e) { couponError = e instanceof AppError ? e.message : "Coupon could not be applied"; }
  }
  const finalLines = first.map((x, i) => computeLine({ ...x.input, extraDiscount: shares[i] }));
  const discountedBase = finalLines.reduce((a, l) => a + l.subtotal - l.discountAmount, 0);
  let stateCode: string | undefined;
  if (d.shippingAddressId) {
    const c = await Customer.findOne({ _id: cid, status: "active" }, { addresses: 1 }).lean();
    stateCode = stateCodeOf(c?.addresses.find((a) => String(a._id) === d.shippingAddressId)?.state);
  }
  const shipping = usable.length ? computeShipping(settings.shipping, discountedBase, stateCode) : 0;
  const totals = computeOrderTotals(finalLines, shipping);
  const freeAbove = settings.shipping.freeAboveMinor;
  return {
    lines: usable.map((l, i) => ({ key: l.key, itemType: l.itemType, name: l.name, quantity: l.quantity, image: l.image, slug: l.slug, unitPrice: l.unitPrice, listPrice: l.listPrice, lineTotal: finalLines[i]!.lineTotal, taxAmount: finalLines[i]!.taxAmount })),
    ...totals, couponCode, couponDiscount, couponError, pricesIncludeTax: inclusive, currency: "INR",
    itemSavings: first.reduce((a, x) => a + (x.input.unitDiscount * x.input.quantity), 0),
    freeShippingRemaining: freeAbove != null && discountedBase < freeAbove ? freeAbove - discountedBase : 0, freeShippingThreshold: freeAbove,
    hasIssues: cart.items.some((l) => !l.available), issues: cart.items.filter((l) => !l.available).map((l) => ({ key: l.key, name: l.name, issue: l.issue })),
  };
}
