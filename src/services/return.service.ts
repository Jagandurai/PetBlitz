import { z } from "zod";
import { createReturnSchema, returnActionSchema, returnRefundSchema, returnQuery } from "@/validations/return.validation";
import { connectDB } from "@/lib/db/connection";
import { conflict, notFound, unprocessable } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { nextSequence } from "@/lib/sequence";
import { Order } from "@/models/Order";
import { ReturnDoc, ReturnRequest } from "@/models/Ops";
import { notifyCustomer } from "./email.service";
import { refundOrder } from "./payment.service";
import { getSettings } from "./settings.service";


const OPEN: ReturnDoc["status"][] = ["requested", "approved", "received", "refunded"]; // statuses that consume the returnable quantity

/** Customer asks to return part/all of a delivered item. Pets are non-returnable unless the store setting allows it. */
export async function createReturn(customerId: string, input: z.input<typeof createReturnSchema>) {
  await connectDB();
  const d = createReturnSchema.parse(input);
  const cid = toObjectId(customerId);
  const order = await Order.findOne({ _id: toObjectId(d.orderId), customerId: cid }).lean();
  if (!order) throw notFound("Order");
  if (order.status !== "delivered") throw unprocessable("RETURN_NOT_ELIGIBLE", "Only delivered orders can be returned");
  const item = order.items.find((i) => String(i._id) === d.orderItemId);
  if (!item) throw unprocessable("RETURN_NOT_ELIGIBLE", "Order item not found");
  const settings = await getSettings();
  if (item.itemType === "pet" && !settings.returns.petsReturnable) throw unprocessable("RETURN_NOT_ELIGIBLE", "Live animals cannot be returned through this form. Please contact support.");
  const deliveredAt = order.shipping?.deliveredAt ?? order.updatedAt;
  if (Date.now() - new Date(deliveredAt).getTime() > settings.returns.windowDays * 86_400_000) throw unprocessable("RETURN_WINDOW_CLOSED", `Returns are accepted within ${settings.returns.windowDays} days of delivery`);
  const used = await ReturnRequest.aggregate([{ $match: { orderId: order._id, orderItemId: item._id, status: { $in: OPEN } } }, { $group: { _id: null, q: { $sum: "$quantity" } } }]);
  if (d.quantity > item.quantity - (used[0]?.q ?? 0)) throw conflict("RETURN_QUANTITY", "That quantity is more than you can still return");
  const r = await ReturnRequest.create({ returnNumber: `RET-${String(await nextSequence("return")).padStart(6, "0")}`, orderId: order._id, orderItemId: item._id, customerId: cid, quantity: d.quantity, reason: d.reason, details: d.details, history: [{ status: "requested", by: "customer" }] });
  return r.toObject();
}

export async function listCustomerReturns(customerId: string, page = 1, pageSize = 20) {
  await connectDB();
  const f = { customerId: toObjectId(customerId) };
  const [items, total] = await Promise.all([ReturnRequest.find(f, { history: 0, adminNote: 0 }).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(Math.min(pageSize, 50)).lean(), ReturnRequest.countDocuments(f)]);
  return { items, page, pageSize, total };
}

export async function listReturnsAdmin(q: z.output<typeof returnQuery>) {
  await connectDB();
  const f = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([ReturnRequest.find(f).sort({ createdAt: 1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(), ReturnRequest.countDocuments(f)]);
  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}

const NEXT: Record<string, { from: ReturnDoc["status"][]; to: ReturnDoc["status"] }> = {
  approve: { from: ["requested"], to: "approved" }, reject: { from: ["requested"], to: "rejected" }, receive: { from: ["approved"], to: "received" }, close: { from: ["rejected", "received", "refunded", "approved"], to: "closed" },
};

/** State machine: requested -> approved|rejected; approved -> received; received -> refunded (via refundReturn) ; any end -> closed. */
export async function actOnReturn(id: string, input: z.input<typeof returnActionSchema>, actor: string) {
  await connectDB();
  const d = returnActionSchema.parse(input);
  const t = NEXT[d.action]!;
  const r = await ReturnRequest.findOneAndUpdate({ _id: toObjectId(id), status: { $in: t.from } }, { $set: { status: t.to, ...(d.note ? { adminNote: d.note } : {}) }, $push: { history: { status: t.to, by: actor, note: d.note } } }, { new: true }).lean();
  if (!r) { if (!(await ReturnRequest.exists({ _id: toObjectId(id) }))) throw notFound("Return"); throw conflict("INVALID_TRANSITION", `Cannot ${d.action} a return in its current state`); }
  await notifyCustomer(r.customerId, "returnUpdate", { returnNumber: r.returnNumber, status: r.status, note: d.note }, `return:${r._id}:${r.status}`);
  return r;
}

/** Refunds a received return: default = proportional line value (incl. tax) for the returned quantity, to the customer's wallet. */
export async function refundReturn(id: string, input: z.input<typeof returnRefundSchema>, actor: string) {
  await connectDB();
  const d = returnRefundSchema.parse(input);
  const r = await ReturnRequest.findById(toObjectId(id)).lean();
  if (!r) throw notFound("Return");
  if (r.status !== "received") throw conflict("INVALID_TRANSITION", "Mark the return as received before refunding");
  const order = await Order.findById(r.orderId, { items: 1 }).lean();
  const item = order?.items.find((i) => String(i._id) === String(r.orderItemId));
  if (!item) throw notFound("Order item");
  const amount = d.amount ?? Math.round((item.lineTotal * r.quantity) / item.quantity);
  // Claim the transition first so a double-click cannot refund twice; the refund itself is cumulative-validated by the payment layer.
  const claimed = await ReturnRequest.findOneAndUpdate({ _id: r._id, status: "received" }, { $set: { status: "refunded", refundAmount: amount }, $push: { history: { status: "refunded", by: actor } } }, { new: true }).lean();
  if (!claimed) throw conflict("INVALID_TRANSITION", "This return was already refunded");
  try {
    await refundOrder(String(r.orderId), { amount, reason: `Return ${r.returnNumber}`, destination: d.destination });
  } catch (e) {
    await ReturnRequest.updateOne({ _id: r._id, status: "refunded" }, { $set: { status: "received" }, $unset: { refundAmount: 1 }, $push: { history: { status: "received", by: "system", note: "refund failed; reverted" } } });
    throw e;
  }
  await notifyCustomer(r.customerId, "returnUpdate", { returnNumber: r.returnNumber, status: "refunded" }, `return:${r._id}:refunded`);
  return claimed;
}
