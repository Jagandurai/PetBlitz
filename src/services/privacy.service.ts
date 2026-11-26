import { connectDB } from "@/lib/db/connection";
import { conflict } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { Cart } from "@/models/Store";
import { Customer, CustomerDoc } from "@/models/Customer";
import { Message } from "@/models/Message";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { Review } from "@/models/Review";
import { ReturnRequest } from "@/models/Ops";
import { WalletTransaction } from "@/models/WalletTransaction";
import { anonymizeCustomer, toCustomerProfile } from "./customer.service";
import { toCustomerOrder } from "./order.service";

const ACTIVE_ORDER = ["placed", "accepted", "confirmed", "processing", "shipped", "in_transit", "out_for_delivery", "refund_initiated"];

/** DPDP-style data export: everything we hold about the signed-in customer, as JSON. Internal notes and idempotency keys are excluded. */
export async function exportMyData(customerId: string) {
  await connectDB();
  const cid = toObjectId(customerId);
  const [c, orders, wallet, tickets, reviews, returns, cart] = await Promise.all([
    Customer.findById(cid).lean(),
    Order.find({ customerId: cid }).sort({ createdAt: -1 }).limit(1000).lean(),
    WalletTransaction.find({ customerId: cid }, { idempotencyKey: 0, createdBy: 0, customerId: 0 }).sort({ createdAt: -1 }).limit(2000).lean(),
    Message.find({ customerId: cid }, { assignedTo: 0 }).limit(500).lean(),
    Review.find({ customerId: cid }).limit(500).lean(),
    ReturnRequest.find({ customerId: cid }, { adminNote: 0 }).limit(500).lean(),
    Cart.findOne({ customerId: cid }).lean(),
  ]);
  return { exportedAt: new Date().toISOString(), profile: c ? toCustomerProfile(c as unknown as CustomerDoc) : null, orders: orders.map((o) => toCustomerOrder(o as never)), walletTransactions: wallet, supportTickets: tickets, reviews, returns, cart: cart?.items ?? [] };
}

/**
 * Account deletion = anonymisation (orders/invoices are kept for tax law with their own snapshots). Blocked while money or
 * goods are in flight so nothing is lost: open orders, pending refunds, or a wallet balance must be settled first.
 */
export async function deleteMyAccount(customerId: string) {
  await connectDB();
  const cid = toObjectId(customerId);
  const blockers: string[] = [];
  const c = await Customer.findById(cid, { walletBalance: 1 }).lean();
  if ((c?.walletBalance ?? 0) > 0) blockers.push("You still have a wallet balance. Use it, or contact support to withdraw it, before deleting your account.");
  if (await Order.exists({ customerId: cid, status: { $in: ACTIVE_ORDER } })) blockers.push("You have orders in progress.");
  if (await Payment.exists({ customerId: cid, "refunds.status": "pending" })) blockers.push("A refund is still being processed.");
  if (await ReturnRequest.exists({ customerId: cid, status: { $in: ["requested", "approved", "received"] } })) blockers.push("You have an open return request.");
  if (blockers.length) throw conflict("DELETE_BLOCKED", blockers.join(" "));
  await Cart.deleteOne({ customerId: cid });
  return anonymizeCustomer(customerId);
}
