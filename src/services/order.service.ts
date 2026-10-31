import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { getEnv } from "@/lib/env";
import { AppError, conflict, isDuplicateKeyError, notFound, unprocessable } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { allocate, computeLine, computeOrderTotals, computeShipping } from "@/lib/pricing";
import { stateCodeOf } from "@/lib/gst";
import { nextOrderNumber } from "@/lib/sequence";
import { Category } from "@/models/Category";
import { Customer } from "@/models/Customer";
import { Order, OrderDoc, OrderStatus } from "@/models/Order";
import { Pet } from "@/models/Pet";
import { Product } from "@/models/Product";
import { AdminShippingInput, CreateOrderInput, adminShippingSchema, createOrderSchema } from "@/validations/order.validation";
import { getPublicCategoryIds } from "./category.service";
import { evaluateCoupon, redeemCoupon, releaseCoupon } from "./coupon.service";
import { notifyCustomer } from "./email.service";
import { ensureInvoice } from "./invoice.service";
import { getSettings } from "./settings.service";
import { markPetSold, releasePetReservation, reservePet, restorePetFromSale } from "./pet.service";
import { commitStock, releaseStock, reserveStock, restockCommitted } from "./product.service";

// ---------------------------------------------------------------- state machine
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ["accepted", "cancelled"],
  accepted: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["in_transit", "delivered"],
  in_transit: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
  delivered: ["refund_initiated"],
  cancelled: ["refund_initiated"], // only meaningful when the order was paid
  refund_initiated: ["refunded"],
  refunded: [],
};
/** Customers may self-cancel only before processing starts. Admins may cancel until shipment. */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ["placed", "accepted", "confirmed"];
export const canTransition = (from: OrderStatus, to: OrderStatus) => ORDER_TRANSITIONS[from]?.includes(to) ?? false;
export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransition(from, to)) throw conflict("INVALID_TRANSITION", `Cannot change order status from "${from}" to "${to}"`);
}

// ---------------------------------------------------------------- pure pricing (see lib/pricing.ts; unit tested)
export { computeLine, computeOrderTotals } from "@/lib/pricing";

// ---------------------------------------------------------------- projections
type OrderLean = OrderDoc;
/** Customer view: no adminNote, no actor ids, no idempotency key. */
export function toCustomerOrder(o: OrderLean) {
  const { adminNote: _a, idempotencyKey: _k, statusHistory, ...rest } = o as OrderLean & { adminNote?: string };
  void _a; void _k;
  return { ...JSON.parse(JSON.stringify(rest)), statusHistory: (statusHistory ?? []).map((h) => ({ from: h.from, to: h.to, at: h.at })) };
}

// ---------------------------------------------------------------- inventory state machine per order item
async function claimItemState(orderId: Types.ObjectId, itemId: Types.ObjectId, from: "reserved" | "committed", to: "committed" | "released"): Promise<boolean> {
  const r = await Order.updateOne({ _id: orderId, items: { $elemMatch: { _id: itemId, inventoryState: from } } }, { $set: { "items.$.inventoryState": to } });
  return r.modifiedCount === 1; // exactly one caller wins => idempotent under retries/duplicate webhooks
}
async function revertItemState(orderId: Types.ObjectId, itemId: Types.ObjectId, to: "reserved" | "committed") {
  await Order.updateOne({ _id: orderId, "items._id": itemId }, { $set: { "items.$.inventoryState": to } });
}

export async function commitOrderInventory(orderId: Types.ObjectId): Promise<void> {
  const order = await Order.findById(orderId).lean();
  if (!order) throw notFound("Order");
  for (const it of order.items) {
    if (!(await claimItemState(orderId, it._id, "reserved", "committed"))) continue;
    try {
      if (it.itemType === "pet") await markPetSold(it.petId!, orderId);
      else await commitStock(it.productId!, it.quantity, orderId);
    } catch (e) { await revertItemState(orderId, it._id, "reserved"); throw e; }
  }
}

export async function releaseOrderInventory(orderId: Types.ObjectId): Promise<void> {
  const order = await Order.findById(orderId).lean();
  if (!order) throw notFound("Order");
  for (const it of order.items) {
    if (await claimItemState(orderId, it._id, "reserved", "released")) {
      if (it.itemType === "pet") await releasePetReservation(it.petId!, orderId);
      else await releaseStock(it.productId!, it.quantity);
    } else if (await claimItemState(orderId, it._id, "committed", "released")) {
      if (it.itemType === "pet") await restorePetFromSale(it.petId!, orderId);
      else await restockCommitted(it.productId!, it.quantity, orderId);
    }
  }
}

// ---------------------------------------------------------------- create order (server-side pricing)
export async function createOrder(customerId: string, input: CreateOrderInput) {
  await connectDB();
  const data = createOrderSchema.parse(input);
  const cid = toObjectId(customerId);

  const dup = await Order.findOne({ customerId: cid, idempotencyKey: data.idempotencyKey }).lean();
  if (dup) return { order: toCustomerOrder(dup as OrderLean), duplicate: true };

  const customer = await Customer.findOne({ _id: cid, status: "active" }).lean();
  if (!customer) throw new AppError("FORBIDDEN", 403, "Customer account is not active");
  const ship = customer.addresses.find((a) => String(a._id) === data.shippingAddressId);
  if (!ship) throw unprocessable("ADDRESS_INVALID", "Shipping address not found");
  const bill = data.billingAddressId ? customer.addresses.find((a) => String(a._id) === data.billingAddressId) : ship;
  if (!bill) throw unprocessable("ADDRESS_INVALID", "Billing address not found");
  const snap = (a: typeof ship) => ({ label: a.label, recipientName: a.recipientName, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, postalCode: a.postalCode, countryCode: a.countryCode });

  // merge duplicate product lines; reject duplicate pets
  const wanted = new Map<string, { itemType: "pet" | "product"; id: string; quantity: number }>();
  for (const it of data.items) {
    const id = it.itemType === "pet" ? it.petId : it.productId;
    const key = `${it.itemType}:${id}`;
    if (it.itemType === "pet" && wanted.has(key)) throw unprocessable("DUPLICATE_PET", "A pet can only be ordered once");
    const prev = wanted.get(key);
    wanted.set(key, { itemType: it.itemType, id, quantity: (prev?.quantity ?? 0) + it.quantity });
  }

  const eligibleCats = await getPublicCategoryIds();
  const settings = await getSettings();
  const inclusive = settings.tax.pricesIncludeTax;
  const placeOfSupply = stateCodeOf(ship.state);
  let couponRedeemed = false;
  const orderId = new Types.ObjectId();
  const reserved: { type: "pet" | "product"; id: Types.ObjectId; qty: number }[] = [];
  const lines: Record<string, unknown>[] = [];

  const catSnap = async (categoryId: Types.ObjectId) => {
    if (!eligibleCats.has(String(categoryId))) throw conflict("ITEM_UNAVAILABLE", "Item is not currently available");
    const c = await Category.findById(categoryId, { name: 1, slug: 1 }).lean();
    return { categoryId, name: c?.name, slug: c?.slug };
  };

  try {
    for (const w of wanted.values()) {
      const oid = toObjectId(w.id);
      if (w.itemType === "pet") {
        const pre = await Pet.findById(oid, { categoryId: 1 }).lean();
        if (!pre) throw notFound("Pet");
        const category = await catSnap(pre.categoryId);
        const pet = await reservePet(oid, cid, orderId);
        reserved.push({ type: "pet", id: oid, qty: 1 });
        const img = pet.media?.find((m) => m.isPrimary) ?? pet.media?.[0];
        const unitDiscount = pet.price - (pet.finalPrice ?? pet.price);
        lines.push({ itemType: "pet", petId: oid, name: pet.name, petCode: pet.petCode, slug: pet.slug, hsnCode: pet.hsnCode, imageUrl: img?.url, category, quantity: 1, unitPrice: pet.price, unitDiscount, taxRateBps: pet.taxRateBps, inventoryState: "reserved", ...computeLine({ unitPrice: pet.price, unitDiscount, quantity: 1, taxRateBps: pet.taxRateBps, inclusive }) });
      } else {
        const pre = await Product.findById(oid, { categoryId: 1 }).lean();
        if (!pre) throw notFound("Product");
        const category = await catSnap(pre.categoryId);
        const prod = await reserveStock(oid, w.quantity);
        reserved.push({ type: "product", id: oid, qty: w.quantity });
        const img = prod.media?.find((m) => m.isPrimary) ?? prod.media?.[0];
        const unitDiscount = prod.price - (prod.finalPrice ?? prod.price);
        lines.push({ itemType: "product", productId: oid, name: prod.name, sku: prod.sku, slug: prod.slug, hsnCode: prod.hsnCode, imageUrl: img?.url, category, quantity: w.quantity, unitPrice: prod.price, unitDiscount, taxRateBps: prod.taxRateBps, inventoryState: "reserved", ...computeLine({ unitPrice: prod.price, unitDiscount, quantity: w.quantity, taxRateBps: prod.taxRateBps, inclusive }) });
      }
    }
    // ---- coupon (server-validated) -> proportional per-line share; tax is then computed on the discounted value
    type L = { itemType: "pet" | "product"; unitPrice: number; unitDiscount: number; quantity: number; taxRateBps: number; subtotal: number; discountAmount: number };
    const first = lines as unknown as L[];
    let shares = first.map(() => 0);
    let coupon: { id: Types.ObjectId; code: string; amount: number } | undefined;
    if (data.couponCode) {
      const ev = await evaluateCoupon(data.couponCode, cid, first.map((l) => ({ kind: l.itemType, base: l.subtotal - l.discountAmount })));
      shares = allocate(ev.discount, ev.eligible);
      coupon = { id: ev.coupon._id, code: ev.coupon.code, amount: shares.reduce((a, b) => a + b, 0) };
    }
    const finalLines = first.map((l, i) => ({ ...(lines[i] as object), ...computeLine({ unitPrice: l.unitPrice, unitDiscount: l.unitDiscount, quantity: l.quantity, taxRateBps: l.taxRateBps, extraDiscount: shares[i], inclusive }) }));
    const discountedBase = finalLines.reduce((a, l) => a + l.subtotal - l.discountAmount, 0);
    const totals = computeOrderTotals(finalLines, computeShipping(settings.shipping, discountedBase, placeOfSupply));
    if (coupon) { await redeemCoupon(coupon.id, cid, orderId, coupon.amount); couponRedeemed = true; }
    const order = await Order.create({
      _id: orderId, orderNumber: await nextOrderNumber(), customerId: cid, idempotencyKey: data.idempotencyKey, items: finalLines, currency: "INR", ...totals,
      couponCode: coupon?.code, couponDiscount: coupon?.amount ?? 0, pricesIncludeTax: inclusive, placeOfSupply,
      customerSnapshot: { name: customer.displayName ?? [customer.firstName, customer.lastName].filter(Boolean).join(" "), email: customer.email, phone: customer.phone },
      shippingAddress: snap(ship), billingAddress: snap(bill), customerNote: data.customerNote,
      statusHistory: [{ to: "placed", actorType: "customer", actorId: String(cid) }],
    });
    await notifyCustomer(cid, "orderPlaced", { orderId: String(orderId), orderNumber: order.orderNumber, total: order.grandTotal }, `order-placed:${orderId}`);
    return { order: toCustomerOrder(order.toObject() as OrderLean), duplicate: false };
  } catch (e) {
    // COMPENSATION: undo every reservation made so far (each release is itself idempotent/guarded).
    if (couponRedeemed) { try { await releaseCoupon(orderId); } catch { /* sweeper-free: usedCount drift is reconciled by admin tooling */ } }
    for (const r of reserved) {
      try { if (r.type === "pet") await releasePetReservation(r.id, orderId); else await releaseStock(r.id, r.qty); } catch { /* sweeper recovers leftovers */ }
    }
    if (isDuplicateKeyError(e)) {
      const again = await Order.findOne({ customerId: cid, idempotencyKey: data.idempotencyKey }).lean();
      if (again) return { order: toCustomerOrder(again as OrderLean), duplicate: true };
    }
    throw e;
  }
}

// ---------------------------------------------------------------- customer reads (scoped to owner)
export async function getOrderForCustomer(customerId: string, orderId: string) {
  await connectDB();
  const o = await Order.findOne({ _id: toObjectId(orderId), customerId: toObjectId(customerId) }).lean();
  if (!o) throw notFound("Order"); // same response for "not yours" and "missing"
  return toCustomerOrder(o as OrderLean);
}

export async function listCustomerOrders(customerId: string, page = 1, pageSize = 20) {
  await connectDB();
  const size = Math.min(Math.max(pageSize, 1), 50);
  const filter = { customerId: toObjectId(customerId) };
  const [rows, total] = await Promise.all([Order.find(filter).sort({ createdAt: -1 }).skip((Math.max(page, 1) - 1) * size).limit(size).lean(), Order.countDocuments(filter)]);
  return { items: rows.map((r) => toCustomerOrder(r as OrderLean)), page, pageSize: size, total };
}

// ---------------------------------------------------------------- status changes
export interface Actor { type: "customer" | "admin" | "system"; id?: string }

/** Idempotent cancellation + reservation release. Customers may only cancel their own, pre-shipment orders. */
export async function cancelOrder(orderId: string, actor: Actor, reason?: string, ownerCustomerId?: string) {
  await connectDB();
  const oid = toObjectId(orderId);
  const filter: Record<string, unknown> = { _id: oid };
  if (actor.type === "customer") filter.customerId = toObjectId(ownerCustomerId ?? actor.id ?? "");
  const order = await Order.findOne(filter).lean();
  if (!order) throw notFound("Order");
  if (order.status === "cancelled") { await releaseOrderInventory(oid); return order as OrderLean; } // idempotent; heals partial releases
  assertTransition(order.status as OrderStatus, "cancelled");
  if (actor.type === "customer" && !CUSTOMER_CANCELLABLE.includes(order.status as OrderStatus)) {
    throw conflict("CANCEL_NOT_ALLOWED", "This order can no longer be cancelled online; please contact support");
  }
  const upd = await Order.findOneAndUpdate(
    { _id: oid, status: order.status },
    { $set: { status: "cancelled", cancellation: { reason, cancelledAt: new Date(), cancelledByType: actor.type } }, $push: { statusHistory: { from: order.status, to: "cancelled", actorType: actor.type, actorId: actor.id, note: reason } } },
    { new: true },
  ).lean();
  if (!upd) { // lost a race
    const again = await Order.findById(oid).lean();
    if (again?.status === "cancelled") return again as OrderLean;
    throw conflict("ORDER_CONFLICT", "Order changed concurrently; retry");
  }
  await releaseOrderInventory(oid);
  await releaseCoupon(oid);
  await notifyCustomer(upd.customerId, "orderCancelled", { orderId: String(oid), orderNumber: upd.orderNumber, refunded: upd.paymentStatus === "paid" ? upd.amountPaid : 0 }, `order-cancelled:${oid}`);
  return upd as OrderLean;
}

/** Admin status change with transition validation + audit entry (optimistic concurrency on the current status). */
export async function transitionOrderStatus(orderId: string, to: OrderStatus, actor: Actor, note?: string) {
  await connectDB();
  if (to === "cancelled") return cancelOrder(orderId, actor, note);
  const oid = toObjectId(orderId);
  const order = await Order.findById(oid).lean();
  if (!order) throw notFound("Order");
  assertTransition(order.status as OrderStatus, to);
  if (to === "confirmed" && order.paymentStatus !== "paid") throw conflict("PAYMENT_REQUIRED", "Order must be paid before it can be confirmed");
  if (to === "refund_initiated" && !["paid", "partially_refunded", "refunded"].includes(order.paymentStatus)) throw conflict("NOTHING_TO_REFUND", "Order has no paid amount to refund");
  if (to === "refunded" && order.paymentStatus !== "refunded") throw conflict("REFUND_INCOMPLETE", "Order can only be marked refunded after the payment is fully refunded");
  const set: Record<string, unknown> = { status: to };
  if (to === "shipped") { set.fulfillmentStatus = "shipped"; set["shipping.shippedAt"] = new Date(); }
  if (to === "delivered") { set.fulfillmentStatus = "delivered"; set["shipping.deliveredAt"] = new Date(); }
  const upd = await Order.findOneAndUpdate({ _id: oid, status: order.status }, { $set: set, $push: { statusHistory: { from: order.status, to, actorType: actor.type, actorId: actor.id, note } } }, { new: true }).lean();
  if (!upd) throw conflict("ORDER_CONFLICT", "Order changed concurrently; retry");
  if (to === "shipped") {
    try { await ensureInvoice(oid); } catch (e) { console.error("[invoice] issue failed", String(oid), e instanceof Error ? e.name : "error"); } // retried by the admin "issue invoice" action
    await notifyCustomer(upd.customerId, "orderShipped", { orderId: String(oid), orderNumber: upd.orderNumber, partner: upd.shipping?.partner, trackingNumber: upd.shipping?.trackingNumber }, `order-shipped:${oid}`);
  }
  if (to === "delivered") await notifyCustomer(upd.customerId, "orderDelivered", { orderId: String(oid), orderNumber: upd.orderNumber }, `order-delivered:${oid}`);
  return upd as OrderLean;
}

export async function updateShipping(orderId: string, input: AdminShippingInput, actor: Actor) {
  await connectDB();
  const d = adminShippingSchema.parse(input);
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (v !== undefined) set[`shipping.${k}`] = v;
  const o = await Order.findOneAndUpdate({ _id: toObjectId(orderId) }, { $set: set, $push: { statusHistory: { from: undefined, to: "shipping_updated", actorType: actor.type, actorId: actor.id } } }, { new: true }).lean();
  if (!o) throw notFound("Order");
  return o as OrderLean;
}

// ---------------------------------------------------------------- payment hooks (called ONLY by payment.service after server-side verification)
/**
 * Called ONLY by payment.service after server-side verification. The order's own atomic `paymentStatus` update is the
 * ARBITER: exactly one payment can settle an order (`paidPaymentId`). Any other successful payment (wallet + Razorpay on the same
 * order, retries after cancellation) is reported as `needsRefund` so the caller sends the money back to the customer's wallet.
 */
export async function markOrderPaid(orderId: Types.ObjectId, amount: number, paymentId: Types.ObjectId): Promise<{ needsRefund: boolean }> {
  await connectDB();
  const order = await Order.findById(orderId).lean();
  if (!order) throw notFound("Order");
  if (amount !== order.grandTotal) throw unprocessable("PAYMENT_MISMATCH", "Paid amount does not match the order total");
  const settled = await Order.updateOne({ _id: orderId, paymentStatus: { $in: ["pending", "failed"] } }, { $set: { paymentStatus: "paid", amountPaid: amount, paidAt: new Date(), paidPaymentId: paymentId } });
  if (settled.modifiedCount === 0) {
    const cur = await Order.findById(orderId, { paidPaymentId: 1 }).lean();
    if (!cur?.paidPaymentId || String(cur.paidPaymentId) !== String(paymentId)) return { needsRefund: true }; // another payment already settled it
    // else: a retry for the SAME payment - fall through and (idempotently) finish inventory
  }
  if (order.status === "cancelled") return { needsRefund: true }; // paid after cancellation
  await commitOrderInventory(orderId);
  // Race: a cancellation may have landed between our status read and the commit. Re-check and undo if so.
  const after = await Order.findById(orderId, { status: 1 }).lean();
  if (after?.status === "cancelled") { await releaseOrderInventory(orderId); return { needsRefund: true }; }
  await notifyCustomer(order.customerId, "orderPaid", { orderId: String(orderId), orderNumber: order.orderNumber, total: amount }, `order-paid:${orderId}`);
  return { needsRefund: false };
}

export async function markOrderPaymentFailed(orderId: Types.ObjectId) {
  await connectDB();
  await Order.updateOne({ _id: orderId, paymentStatus: "pending" }, { $set: { paymentStatus: "failed" } }); // never overwrites 'paid'
}

export async function applyRefundToOrder(orderId: Types.ObjectId, totalRefunded: number, fullyRefunded: boolean) {
  await connectDB();
  await Order.updateOne(
    { _id: orderId },
    { $set: { amountRefunded: totalRefunded, paymentStatus: totalRefunded === 0 ? "paid" : fullyRefunded ? "refunded" : "partially_refunded", "refundSummary.totalRefunded": totalRefunded, "refundSummary.lastRefundAt": new Date() } },
  );
}

/** Sweeper: cancels unpaid orders older than the reservation TTL so stock/pets are released. Idempotent. */
export async function expireUnpaidOrders(now = new Date()): Promise<number> {
  await connectDB();
  const cutoff = new Date(now.getTime() - getEnv().RESERVATION_TTL_MINUTES * 60_000);
  const stale = (await Order.find({ status: "placed", paymentStatus: "pending" }, { _id: 1, createdAt: 1 }).limit(200).lean()).filter((o) => o.createdAt <= cutoff);
  let n = 0;
  for (const o of stale) {
    try {
      const upd = await Order.updateOne(
        { _id: o._id, status: "placed", paymentStatus: "pending" },
        { $set: { status: "cancelled", cancellation: { reason: "Payment window expired", cancelledAt: new Date(), cancelledByType: "system" } }, $push: { statusHistory: { from: "placed", to: "cancelled", actorType: "system", note: "Payment window expired" } } },
      );
      if (upd.modifiedCount === 1) n++;
      await releaseOrderInventory(o._id);
    } catch {
      /* continue with the rest */
    }
  }
  return n;
}

// ---------------------------------------------------------------- admin queries
export interface AdminOrderQuery { status?: string; paymentStatus?: string; customerId?: string; q?: string; from?: Date; to?: Date; page: number; pageSize: number }

export async function listOrdersAdmin(qy: AdminOrderQuery) {
  await connectDB();
  const f: Record<string, unknown> = {};
  if (qy.status) f.status = qy.status;
  if (qy.paymentStatus) f.paymentStatus = qy.paymentStatus;
  if (qy.customerId) f.customerId = toObjectId(qy.customerId, "customerId");
  if (qy.q) f.orderNumber = qy.q.toUpperCase(); // exact match: index-friendly, no regex from user input
  if (qy.from || qy.to) f.createdAt = { ...(qy.from ? { $gte: qy.from } : {}), ...(qy.to ? { $lte: qy.to } : {}) };
  const [items, total] = await Promise.all([
    Order.find(f, { items: 0, statusHistory: 0 }).sort({ createdAt: -1 }).skip((qy.page - 1) * qy.pageSize).limit(qy.pageSize).lean(),
    Order.countDocuments(f),
  ]);
  return { items, page: qy.page, pageSize: qy.pageSize, total, totalPages: Math.max(1, Math.ceil(total / qy.pageSize)) };
}

export async function getOrderAdmin(orderId: string) {
  await connectDB();
  const oid = toObjectId(orderId);
  const order = await Order.findById(oid).lean();
  if (!order) throw notFound("Order");
  const { Payment } = await import("@/models/Payment");
  const payments = await Payment.find({ orderId: oid }, { processedEvents: 0 }).sort({ createdAt: 1 }).lean();
  return { order, payments };
}

export async function setAdminNote(orderId: string, note: string, actor: Actor) {
  await connectDB();
  const o = await Order.findOneAndUpdate({ _id: toObjectId(orderId) }, { $set: { adminNote: note } }, { new: true }).lean();
  if (!o) throw notFound("Order");
  void actor; // audit trail for notes is the response + request log; statusHistory is for state changes only
  return o as OrderLean;
}
