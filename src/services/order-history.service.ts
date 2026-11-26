/**
 * Keeping the admin order list manageable.
 * ARCHIVE only hides an order from the active admin list (reversible; customers, reports and records are untouched).
 * DELETE is permanent, so it is limited to orders that never involved money: see `blockedReasons`.
 */
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { notFound, unprocessable } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { Invoice, ReturnRequest } from "@/models/Ops";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { Review } from "@/models/Review";

/** Bulk archive only touches finished orders, so nothing that still needs work can be hidden by a date range. */
export const FINISHED = ["delivered", "cancelled", "refunded"] as const;
/** A payment can be confirmed a while after an order is cancelled (and is then auto-refunded), so wait before deleting. */
const SETTLE_MS = 24 * 60 * 60_000;
const MAX_DELETE = 500;

interface Deletable { _id: Types.ObjectId; status: string; paymentStatus: string; amountPaid?: number; amountRefunded?: number; updatedAt: Date; cancellation?: { cancelledAt?: Date | null } | null; items: { inventoryState?: string }[] }
const FIELDS = "status paymentStatus amountPaid amountRefunded updatedAt cancellation items.inventoryState";

/** Order id -> why it must be kept. Orders missing from the map are safe to delete. */
async function blockedReasons(orders: Deletable[], now = Date.now()) {
  const ids = orders.map((o) => o._id);
  const [paid, invoices, returns, reviews] = await Promise.all([
    Payment.distinct("orderId", { orderId: { $in: ids }, $or: [{ status: { $in: ["paid", "partially_refunded", "refunded"] } }, { amountRefunded: { $gt: 0 } }] }),
    Invoice.distinct("orderId", { orderId: { $in: ids } }),
    ReturnRequest.distinct("orderId", { orderId: { $in: ids } }),
    Review.distinct("orderId", { orderId: { $in: ids } }),
  ]);
  const set = (list: unknown[]) => new Set(list.map(String));
  const linked: [Set<string>, string][] = [[set(paid), "it has a payment record"], [set(invoices), "it has a GST invoice"], [set(returns), "it has a return request"], [set(reviews), "it has a product review"]];
  const out = new Map<string, string>();
  for (const o of orders) {
    const key = String(o._id);
    const cancelledAt = new Date(o.cancellation?.cancelledAt ?? o.updatedAt).getTime();
    const why = o.status !== "cancelled" ? "only cancelled orders can be deleted"
      : !["pending", "failed"].includes(o.paymentStatus) || (o.amountPaid ?? 0) > 0 || (o.amountRefunded ?? 0) > 0 ? "money was paid or refunded on it"
      : linked.find(([s]) => s.has(key))?.[1]
      ?? (o.items.some((i) => i.inventoryState === "reserved") ? "stock is still reserved for it"
      : now - cancelledAt < SETTLE_MS ? "it was cancelled less than 24 hours ago" : "");
    if (why) out.set(key, why);
  }
  return out;
}

export async function setOrderArchived(orderId: string, archived: boolean) {
  await connectDB();
  const r = await Order.updateOne({ _id: toObjectId(orderId) }, archived ? { $set: { archivedAt: new Date(), adminUnread: false } } : { $unset: { archivedAt: 1 } }, { timestamps: false });
  if (!r.matchedCount) throw notFound("Order");
  return { archived };
}

export async function deleteOrder(orderId: string) {
  await connectDB();
  const o = (await Order.findById(toObjectId(orderId), FIELDS + " orderNumber").lean()) as (Deletable & { orderNumber: string }) | null;
  if (!o) throw notFound("Order");
  const why = (await blockedReasons([o])).get(String(o._id));
  if (why) throw unprocessable("ORDER_NOT_DELETABLE", `${o.orderNumber} cannot be deleted because ${why}. Archive it instead.`);
  // the status is checked again in the delete itself, in case it changed meanwhile
  const r = await Order.deleteOne({ _id: o._id, status: "cancelled", paymentStatus: { $in: ["pending", "failed"] } });
  if (!r.deletedCount) throw unprocessable("ORDER_NOT_DELETABLE", "This order has just changed. Refresh and try again.");
  return { deleted: true, orderNumber: o.orderNumber };
}

export interface Range { from?: Date; to: Date; preview?: boolean }
const inRange = ({ from, to }: Range) => ({ createdAt: { ...(from ? { $gte: from } : {}), $lte: to } });

/** Archives the finished orders placed in the range, or restores every archived one. `preview` only counts. */
export async function archiveRange(range: Range, archived: boolean) {
  await connectDB();
  const base = inRange(range);
  const match = archived ? { ...base, archivedAt: null, status: { $in: [...FINISHED] } } : { ...base, archivedAt: { $ne: null } };
  const [total, affected] = await Promise.all([Order.countDocuments(archived ? { ...base, archivedAt: null } : match), Order.countDocuments(match)]);
  if (!range.preview && affected) await Order.updateMany(match, archived ? { $set: { archivedAt: new Date(), adminUnread: false } } : { $unset: { archivedAt: 1 } }, { timestamps: false });
  return { total, affected, kept: total - affected, done: !range.preview };
}

/** Deletes the orders in the range that are safe to delete, at most MAX_DELETE per run. Everything else stays. */
export async function deleteRange(range: Range) {
  await connectDB();
  const base = inRange(range);
  const [total, candidates] = await Promise.all([
    Order.countDocuments(base),
    Order.find({ ...base, status: "cancelled", paymentStatus: { $in: ["pending", "failed"] } }, FIELDS).sort({ createdAt: 1 }).limit(MAX_DELETE).lean() as unknown as Promise<Deletable[]>,
  ]);
  const blocked = await blockedReasons(candidates);
  const ids = candidates.filter((o) => !blocked.has(String(o._id))).map((o) => o._id);
  let affected = ids.length;
  if (!range.preview && ids.length) affected = (await Order.deleteMany({ _id: { $in: ids }, status: "cancelled", paymentStatus: { $in: ["pending", "failed"] } })).deletedCount;
  return { total, affected, kept: total - affected, done: !range.preview, more: candidates.length === MAX_DELETE };
}
