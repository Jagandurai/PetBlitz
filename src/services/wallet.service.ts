import { ClientSession, Types } from "mongoose";
import { connectDB, withTransaction } from "@/lib/db/connection";
import { AppError, conflict, isDuplicateKeyError, notFound } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { Customer } from "@/models/Customer";
import { WalletTransaction, WalletTxDoc } from "@/models/WalletTransaction";
import { WalletAdjustInput, walletAdjustSchema } from "@/validations/payment.validation";

/**
 * WALLET RULES
 *  - Balance lives on Customer.walletBalance (paise, never negative); every change has an append-only ledger row.
 *  - Each change carries a UNIQUE idempotencyKey => retries/duplicate webhooks cannot double-credit or double-debit.
 *  - Ledger row + balance change run in one transaction when the cluster supports it (Atlas does). Without
 *    transactions the ledger row is written FIRST (claims the key) and `reconcileWallet` detects any drift.
 *  - Debits are guarded (`walletBalance >= amount`) so the balance can never go negative, even concurrently.
 */
export interface WalletChange { reason: WalletTxDoc["reason"]; idempotencyKey: string; orderId?: Types.ObjectId; paymentId?: Types.ObjectId; refundId?: Types.ObjectId; description?: string; createdBy?: string }
export interface WalletResult { applied: boolean; balance: number }

async function existingResult(key: string): Promise<WalletResult> {
  const tx = await WalletTransaction.findOne({ idempotencyKey: key }).lean();
  return { applied: false, balance: tx?.balanceAfter ?? 0 };
}

async function change(customerId: string | Types.ObjectId, amount: number, type: "credit" | "debit", c: WalletChange): Promise<WalletResult> {
  await connectDB();
  if (!Number.isInteger(amount) || amount < 1) throw new AppError("INVALID_AMOUNT", 422, "Amount must be a positive integer (paise)");
  const cid = toObjectId(customerId, "customerId");
  try {
    return await withTransaction(async (session: ClientSession | undefined) => {
      const opt = { session };
      const [claim] = await WalletTransaction.create([{ customerId: cid, type, amount, reason: c.reason, description: c.description, orderId: c.orderId, paymentId: c.paymentId, refundId: c.refundId, idempotencyKey: c.idempotencyKey, createdBy: c.createdBy }], opt);
      const filter = type === "debit" ? { _id: cid, status: "active", walletBalance: { $gte: amount } } : { _id: cid, status: { $ne: "deleted" } };
      const cust = await Customer.findOneAndUpdate(filter, { $inc: { walletBalance: type === "credit" ? amount : -amount } }, { new: true, session }).lean();
      if (!cust) {
        await WalletTransaction.deleteOne({ _id: claim!._id }, opt); // release the claim (non-transactional mode)
        const exists = await Customer.exists({ _id: cid });
        if (!exists) throw notFound("Customer");
        throw conflict(type === "debit" ? "INSUFFICIENT_WALLET_BALANCE" : "WALLET_UNAVAILABLE", type === "debit" ? "Insufficient wallet balance" : "Wallet cannot be credited");
      }
      await WalletTransaction.updateOne({ _id: claim!._id }, { $set: { balanceAfter: cust.walletBalance } }, opt);
      return { applied: true, balance: cust.walletBalance };
    });
  } catch (e) {
    if (isDuplicateKeyError(e)) return existingResult(c.idempotencyKey); // already applied earlier => no-op
    throw e;
  }
}

export const creditWallet = (customerId: string | Types.ObjectId, amount: number, c: WalletChange) => change(customerId, amount, "credit", c);
export const debitWallet = (customerId: string | Types.ObjectId, amount: number, c: WalletChange) => change(customerId, amount, "debit", c);

/** Owner view: balance + paginated statement. */
export async function getWallet(customerId: string, page = 1, pageSize = 20, opts: { admin?: boolean } = {}) {
  await connectDB();
  const cid = toObjectId(customerId);
  const size = Math.min(Math.max(pageSize, 1), 50);
  const cust = await Customer.findOne({ _id: cid, ...(opts.admin ? {} : { status: "active" }) }, { walletBalance: 1 }).lean();
  if (!cust) throw notFound("Customer");
  const [rows, total] = await Promise.all([
    WalletTransaction.find({ customerId: cid }, opts.admin ? { customerId: 0 } : { customerId: 0, idempotencyKey: 0, createdBy: 0 }).sort({ createdAt: -1 }).skip((Math.max(page, 1) - 1) * size).limit(size).lean(),
    WalletTransaction.countDocuments({ customerId: cid }),
  ]);
  return {
    balance: cust.walletBalance ?? 0, currency: "INR",
    transactions: rows.map((t) => ({ id: String(t._id), type: t.type, amount: t.amount, balanceAfter: t.balanceAfter, reason: t.reason, description: t.description, orderId: t.orderId ? String(t.orderId) : undefined, createdAt: t.createdAt, ...(opts.admin ? { createdBy: t.createdBy, idempotencyKey: t.idempotencyKey } : {}) })),
    page, pageSize: size, total,
  };
}

/** Admin-only manual adjustment (support goodwill, corrections). Always ledgered and idempotent. */
export async function adminAdjustWallet(input: WalletAdjustInput, adminId: string) {
  const d = walletAdjustSchema.parse(input);
  const c: WalletChange = { reason: "admin_adjustment", idempotencyKey: `admin-adjust:${d.idempotencyKey}`, description: d.reason, createdBy: adminId };
  return d.direction === "credit" ? creditWallet(d.customerId, d.amount, c) : debitWallet(d.customerId, d.amount, c);
}

/** Integrity check: balance must equal sum(credits) - sum(debits). Pass fix=true to correct the balance from the ledger. */
export async function reconcileWallet(customerId: string, fix = false) {
  await connectDB();
  const cid = toObjectId(customerId);
  const [agg] = await WalletTransaction.aggregate([{ $match: { customerId: cid } }, { $group: { _id: null, net: { $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", { $multiply: ["$amount", -1] }] } } } }]);
  const ledger = agg?.net ?? 0;
  const cust = await Customer.findById(cid, { walletBalance: 1 }).lean();
  if (!cust) throw notFound("Customer");
  const consistent = cust.walletBalance === ledger;
  if (!consistent && fix && ledger >= 0) await Customer.updateOne({ _id: cid }, { $set: { walletBalance: ledger } });
  return { balance: cust.walletBalance, ledger, consistent, fixed: !consistent && fix && ledger >= 0 };
}
