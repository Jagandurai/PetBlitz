import crypto from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { getEnv } from "@/lib/env";
import { AppError, conflict, notFound, unprocessable } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { getRazorpay, RazorpayEvent, RzpPayment, verifyCheckoutSignature } from "@/lib/razorpay";
import { sanitizeText } from "@/lib/sanitize";
import { nextPaymentRef } from "@/lib/sequence";
import { Customer } from "@/models/Customer";
import { Order } from "@/models/Order";
import { Payment, PaymentDoc } from "@/models/Payment";
import { RazorpayCheckoutInput, RefundInput, razorpayCheckoutSchema, refundSchema } from "@/validations/payment.validation";
import { applyRefundToOrder, cancelOrder, markOrderPaid, markOrderPaymentFailed, Actor } from "./order.service";
import { creditWallet, debitWallet } from "./wallet.service";
import { notifyCustomer } from "./email.service";

type PaymentLean = PaymentDoc;
type Result = { handled: boolean; duplicate?: boolean; reason?: string };
type RazorpayOrderList = {
  entity: string;
  count: number;
  items: Array<{
    id: string;
    amount: number | string;
    currency?: string;
    notes?: Record<string, string | number | null | undefined>;
    receipt?: string;
  }>;
};

const RAZORPAY_ORDER_CLAIM_TTL_MS = 60_000;

function newClaimToken() {
  return crypto.randomUUID();
}

function claimLease() {
  return { claimToken: newClaimToken(), claimLeaseExpiresAt: new Date(Date.now() + RAZORPAY_ORDER_CLAIM_TTL_MS) };
}

async function findCurrentPendingRazorpayPayment(orderId: Types.ObjectId) {
  return Payment.findOne({ orderId, provider: "razorpay", status: "pending" }).sort({ createdAt: 1 }).lean();
}

async function acquireRazorpayClaim(paymentId: Types.ObjectId) {
  const lease = claimLease();
  const updated = await Payment.findOneAndUpdate(
    {
      _id: paymentId,
      provider: "razorpay",
      status: "pending",
      $or: [
        { claimToken: { $exists: false } },
        { claimLeaseExpiresAt: { $lt: new Date() } },
      ],
    },
    { $set: lease },
    { new: true },
  ).lean();
  return updated ? { payment: updated, ...lease } : null;
}

/** Razorpay SDK errors are plain objects: { statusCode, error: { code, description } }. Network failures have no statusCode. */
function razorpayStatusCode(error: unknown): number | undefined {
  const code = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === "number" ? code : undefined;
}
/** No HTTP status (timeout/reset/DNS), 5xx or 429: Razorpay MAY have created the order -> reconcile, never blindly retry. */
function isUncertainRazorpayError(error: unknown): boolean {
  const sc = razorpayStatusCode(error);
  return sc === undefined || sc >= 500 || sc === 429;
}
/** 4xx (except 429): Razorpay explicitly refused, nothing was created -> safe to release the claim. */
function isDefinitiveRazorpayRejection(error: unknown): boolean {
  const sc = razorpayStatusCode(error);
  return sc !== undefined && sc >= 400 && sc < 500 && sc !== 429;
}

async function clearRazorpayClaim(paymentId: Types.ObjectId, claimToken?: string) {
  await Payment.updateOne({ _id: paymentId, ...(claimToken ? { claimToken } : {}) }, { $unset: { claimToken: 1, claimLeaseExpiresAt: 1 } });
}

async function reconcileExistingRazorpayOrder(order: { _id?: Types.ObjectId; customerId?: Types.ObjectId; grandTotal?: number; currency?: string }, payment: PaymentDoc, token?: string): Promise<{ providerOrderId: string; amount: number; currency: string; paymentRef: string } | null> {
  const { rzp } = getRazorpay();
  const page: RazorpayOrderList = await rzp.orders.all({ receipt: payment.paymentRef, count: 100 });
  const items = Array.isArray(page?.items) ? page.items : [];
  const matches = items.filter((entry): entry is { id: string; amount: number | string; currency?: string; notes?: Record<string, string | number | null | undefined>; receipt?: string } => {
    const e = entry as { id?: string; amount?: number | string; currency?: string; notes?: Record<string, string | number | null | undefined>; receipt?: string };
    if (!e || !e.id || !e.receipt) return false;
    if (e.receipt !== payment.paymentRef) return false;
    if (Number(e.amount) !== payment.amount) return false;
    if (e.currency && e.currency.toUpperCase() !== payment.currency) return false;
    if (order._id && e.notes?.orderId && String(e.notes.orderId) !== String(order._id)) return false;
    if (e.notes?.paymentRef && String(e.notes.paymentRef) !== payment.paymentRef) return false;
    return true;
  });
  if (matches.length !== 1) return null;
  const providerOrderId = String(matches[0].id);
  const claimGate = token ? { claimToken: token } : {
    $or: [
      { claimToken: { $exists: false } },
      { claimLeaseExpiresAt: { $lt: new Date() } },
    ],
  };
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, provider: "razorpay", status: "pending", ...claimGate },
    { $set: { providerOrderId }, $unset: { claimToken: 1, claimLeaseExpiresAt: 1 } },
    { new: true },
  ).lean();
  if (!updated) return null;
  return { providerOrderId, amount: payment.amount, currency: payment.currency, paymentRef: payment.paymentRef };
}

async function createRazorpayOrderForPayment(order: { _id?: Types.ObjectId; customerId?: Types.ObjectId; grandTotal?: number; currency?: string }, payment: PaymentDoc, token: string, notes: Record<string, string> = { orderId: String(order._id) }) {
  const { rzp, keyId } = getRazorpay();
  try {
    const created = await rzp.orders.create({ amount: payment.amount, currency: payment.currency, receipt: payment.paymentRef, notes: { ...notes, paymentRef: payment.paymentRef } });
    const updated = await Payment.findOneAndUpdate(
      { _id: payment._id, provider: "razorpay", status: "pending", claimToken: token },
      { $set: { providerOrderId: created.id }, $unset: { claimToken: 1, claimLeaseExpiresAt: 1 } },
      { new: true },
    ).lean();
    if (!updated) {
      const reconciled = await reconcileExistingRazorpayOrder(order, payment, token);
      if (reconciled) return { keyId, ...reconciled };
      throw new AppError("RAZORPAY_ORDER_UNCERTAIN", 503, "Razorpay order creation was claimed by another request; reconciliation is required before retrying");
    }
    return { keyId, razorpayOrderId: created.id, amount: payment.amount, currency: payment.currency, paymentRef: payment.paymentRef };
  } catch (error) {
    const reconciled = await reconcileExistingRazorpayOrder(order, payment, token);
    if (reconciled) return { keyId, ...reconciled };
    if (isDefinitiveRazorpayRejection(error)) {
      await clearRazorpayClaim(payment._id, token);
      throw error;
    }
    if (isUncertainRazorpayError(error)) {
      throw new AppError("RAZORPAY_ORDER_UNCERTAIN", 503, "Razorpay order creation timed out or may already have succeeded; retry later");
    }
    throw error;
  }
}

// ================================================================ creating payments
async function assertPayable(orderId: string, customerId: string) {
  const order = await Order.findOne({ _id: toObjectId(orderId), customerId: toObjectId(customerId) }).lean();
  if (!order) throw notFound("Order");
  if (order.status !== "placed" || order.paymentStatus !== "pending") throw conflict("ORDER_NOT_PAYABLE", "Order is not awaiting payment");
  return order;
}

/**
 * Gated (needs RAZORPAY_KEY_ID/SECRET). Amount and currency ALWAYS come from the order in the database.
 * Returns what the browser needs to open Razorpay Checkout. Reuses an existing open Razorpay order for the same order.
 */
export async function createRazorpayOrder(orderId: string, customerId: string) {
  await connectDB();
  const order = await assertPayable(orderId, customerId);
  const pending = await findCurrentPendingRazorpayPayment(order._id);
  // One active pending Razorpay payment per real order; if a prior request created a row but not
  // providerOrderId yet, the lease remains authoritative until reconciliation proves a safe outcome.
  if (pending?.providerOrderId) {
    return { keyId: getRazorpay().keyId, razorpayOrderId: pending.providerOrderId!, amount: pending.amount, currency: pending.currency, paymentRef: pending.paymentRef };
  }
  if (pending && !pending.providerOrderId) {
    const claimIsActive = pending.claimLeaseExpiresAt && pending.claimLeaseExpiresAt.getTime() > Date.now();
    if (claimIsActive) {
      throw conflict("RAZORPAY_ORDER_IN_PROGRESS", "Another request is creating this order's Razorpay order");
    }
    const reconciled = await reconcileExistingRazorpayOrder(order, pending as PaymentDoc);
    if (reconciled) {
      return { keyId: getRazorpay().keyId, ...reconciled };
    }
    if (pending.claimLeaseExpiresAt && pending.claimLeaseExpiresAt.getTime() <= Date.now()) {
      throw new AppError("RAZORPAY_ORDER_UNCERTAIN", 503, "Razorpay order creation is uncertain; retry later");
    }
    const claimed = await acquireRazorpayClaim(pending._id);
    if (!claimed) {
      throw conflict("RAZORPAY_ORDER_IN_PROGRESS", "Another request is creating this order's Razorpay order");
    }
    return createRazorpayOrderForPayment(order, pending as PaymentDoc, claimed.claimToken, { orderId: String(order._id) });
  }

  const payment = await Payment.create({
    paymentRef: await nextPaymentRef(),
    orderId: order._id,
    customerId: order.customerId,
    provider: "razorpay",
    amount: order.grandTotal,
    currency: order.currency,
    ...claimLease(),
  });
  try {
    return await createRazorpayOrderForPayment(order, payment as PaymentDoc, payment.claimToken!, { orderId: String(order._id) });
  } catch (error) {
    if (isDefinitiveRazorpayRejection(error)) {
      await clearRazorpayClaim(payment._id, payment.claimToken!);
    }
    throw error;
  }
}

/** Pay an order entirely from the customer's wallet balance. */
export async function payOrderWithWallet(orderId: string, customerId: string) {
  await connectDB();
  const order = await assertPayable(orderId, customerId);
  const payment = await Payment.create({ paymentRef: await nextPaymentRef(), orderId: order._id, customerId: order.customerId, provider: "wallet", amount: order.grandTotal, currency: order.currency, paymentMethodType: "wallet" });
  const failPayment = (code: string) => Payment.updateOne({ _id: payment._id, status: "pending" }, { $set: { status: "failed", failedAt: new Date(), failureCode: code } });
  let debit;
  try {
    debit = await debitWallet(order.customerId, payment.amount, { reason: "order_payment", idempotencyKey: `order-pay:${order._id}`, orderId: order._id, paymentId: payment._id, description: `Payment for ${order.orderNumber}` });
  } catch (e) { await failPayment("wallet_debit_failed"); throw e; }
  if (!debit.applied) { await failPayment("duplicate_attempt"); throw conflict("WALLET_PAYMENT_IN_PROGRESS", "A wallet payment for this order was already processed"); }
  await Payment.updateOne({ _id: payment._id, status: "pending" }, { $set: { status: "paid", paidAt: new Date() } });
  try {
    const r = await markOrderPaid(order._id, payment.amount, payment._id);
    if (r.needsRefund) await refundRemainder(payment._id, "Order was cancelled or already paid");
  } catch (e) {
    // Put the money back and fail the attempt so the customer can retry.
    await creditWallet(order.customerId, payment.amount, { reason: "order_payment_reversal", idempotencyKey: `order-pay-reversal:${order._id}`, orderId: order._id, paymentId: payment._id });
    await Payment.updateOne({ _id: payment._id }, { $set: { status: "failed", failedAt: new Date(), failureCode: "order_update_failed" }, $unset: { paidAt: 1 } });
    throw e;
  }
  return { paymentRef: payment.paymentRef, balance: debit.balance };
}

// ================================================================ Razorpay success / failure
async function findPayment(ref: { paymentRef?: string; providerOrderId?: string; providerPaymentId?: string }): Promise<PaymentLean | null> {
  if (ref.paymentRef) { const p = await Payment.findOne({ paymentRef: ref.paymentRef }).lean(); if (p) return p; }
  if (ref.providerOrderId) { const p = await Payment.findOne({ providerOrderId: ref.providerOrderId }).lean(); if (p) return p; }
  if (ref.providerPaymentId) return Payment.findOne({ providerPaymentId: ref.providerPaymentId }).lean();
  return null;
}
const eventClaim = (eventId: string, type: string) => ({ $each: [{ eventId, type, processedAt: new Date() }], $slice: -50 });

interface SuccessInfo { eventId: string; eventType: string; paymentRef?: string; providerOrderId?: string; providerPaymentId: string; amount: number; currency: string; method?: string }

async function handleSuccess(x: SuccessInfo): Promise<Result> {
  const payment = await findPayment(x);
  if (!payment) return { handled: false, reason: "payment_not_found" };
  if (payment.provider !== "razorpay") return { handled: false, reason: "wrong_provider" };
  if (payment.processedEvents?.some((e) => e.eventId === x.eventId)) return { handled: true, duplicate: true };
  const order = payment.orderId ? await Order.findById(payment.orderId, { grandTotal: 1, currency: 1 }).lean() : null;
  const isTopup = payment.purpose === "wallet_topup";
  // Validate against OUR records, never the payload alone.
  const bad =
    x.amount !== payment.amount || x.currency.toUpperCase() !== payment.currency ||
    (payment.providerOrderId && x.providerOrderId && payment.providerOrderId !== x.providerOrderId) ||
    (!isTopup && (!order || x.amount !== order.grandTotal || order.currency !== payment.currency));
  if (bad) { console.error("[razorpay] amount/currency/order mismatch", payment.paymentRef); return { handled: false, reason: "mismatch" }; }

  // ONE atomic step: event dedupe + state change.
  const prev = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ["pending", "failed"] }, "processedEvents.eventId": { $ne: x.eventId } },
    { $set: { status: "paid", paidAt: new Date(), providerPaymentId: x.providerPaymentId, ...(x.method ? { paymentMethodType: x.method } : {}) }, $unset: { failureCode: 1, failureMessage: 1, failedAt: 1 }, $push: { processedEvents: eventClaim(x.eventId, x.eventType) } },
    { new: false },
  ).lean();
  if (!prev) {
    const r = await Payment.updateOne({ _id: payment._id, "processedEvents.eventId": { $ne: x.eventId } }, { $push: { processedEvents: eventClaim(x.eventId, x.eventType) } });
    return { handled: true, duplicate: r.modifiedCount === 0, reason: "already_paid" };
  }
  try {
    if (isTopup) {
      // Credit is keyed by payment id => a retry after a partial failure can never double-credit.
      await creditWallet(payment.customerId, payment.amount, { reason: "topup", idempotencyKey: `topup:${payment._id}`, paymentId: payment._id, description: "Wallet top-up via Razorpay" });
      await notifyCustomer(payment.customerId, "walletTopup", { amount: payment.amount }, `topup:${payment._id}`);
    } else {
      const r = await markOrderPaid(payment.orderId!, payment.amount, payment._id);
      if (r.needsRefund) {
        // A duplicate successful payment must be returned to the wallet without disturbing the order's original settlement.
        await creditWallet(payment.customerId, payment.amount, {
          reason: "order_payment_reversal",
          idempotencyKey: `duplicate-order-payment:${payment._id}`,
          orderId: payment.orderId ?? undefined,
          paymentId: payment._id,
          description: "Duplicate order payment returned to wallet",
        });
        await Payment.updateOne({ _id: payment._id }, { $set: { status: "refunded", paidAt: new Date() }, $unset: { failedAt: 1, failureCode: 1, failureMessage: 1 } });
      }
    }
  } catch (e) {
    await Payment.updateOne({ _id: payment._id }, { $set: { status: prev.status }, $unset: { paidAt: 1 }, $pull: { processedEvents: { eventId: x.eventId } } }); // let Razorpay retry
    throw e;
  }
  return { handled: true };
}

async function handleFailure(eventId: string, eventType: string, p: RzpPayment): Promise<Result> {
  const payment = await findPayment({ paymentRef: p.notes?.paymentRef, providerOrderId: p.order_id, providerPaymentId: p.id });
  if (!payment) return { handled: false, reason: "payment_not_found" };
  // status:'pending' filter => a failure can NEVER overwrite a verified successful payment.
  const r = await Payment.updateOne(
    { _id: payment._id, status: "pending", "processedEvents.eventId": { $ne: eventId } },
    { $set: { status: "failed", failedAt: new Date(), failureCode: sanitizeText(p.error_code ?? "").slice(0, 100) || undefined, failureMessage: sanitizeText(p.error_description ?? "").slice(0, 300) || undefined, ...(p.method ? { paymentMethodType: p.method } : {}) }, $push: { processedEvents: eventClaim(eventId, eventType) } },
  );
  if (r.modifiedCount === 1 && payment.orderId) await markOrderPaymentFailed(payment.orderId);
  return { handled: true, duplicate: r.modifiedCount === 0 && !!payment.processedEvents?.some((e) => e.eventId === eventId) };
}

/** Browser callback after Razorpay Checkout. Verifies the HMAC signature, then re-fetches the payment from Razorpay server-side (never trusts browser amounts). */
export async function confirmRazorpayCheckout(customerId: string, input: RazorpayCheckoutInput): Promise<Result> {
  await connectDB();
  const d = razorpayCheckoutSchema.parse(input);
  if (!verifyCheckoutSignature(d.razorpay_order_id, d.razorpay_payment_id, d.razorpay_signature)) throw new AppError("INVALID_SIGNATURE", 400, "Invalid payment signature");
  const mine = await Payment.findOne({ providerOrderId: d.razorpay_order_id, customerId: toObjectId(customerId) }).lean();
  if (!mine) throw notFound("Payment");
  const { rzp } = getRazorpay();
  let rp = (await rzp.payments.fetch(d.razorpay_payment_id)) as unknown as RzpPayment;
  if (rp.status === "authorized") rp = (await rzp.payments.capture(rp.id, rp.amount, rp.currency)) as unknown as RzpPayment; // only if auto-capture is off
  if (rp.status !== "captured" || rp.order_id !== d.razorpay_order_id) return { handled: false, reason: "not_captured" };
  return handleSuccess({ eventId: `client:${rp.id}`, eventType: "client.confirm", paymentRef: mine.paymentRef, providerOrderId: rp.order_id, providerPaymentId: rp.id, amount: rp.amount, currency: rp.currency, method: rp.method });
}

/** Event must already be signature-verified (lib/razorpay.verifyRazorpayWebhook). */
export async function processRazorpayEvent(eventId: string, ev: RazorpayEvent): Promise<Result> {
  await connectDB();
  const pay = ev.payload.payment?.entity;
  switch (ev.event) {
    case "payment.captured":
    case "order.paid": {
      if (!pay) return { handled: false, reason: "no_payment" };
      return handleSuccess({ eventId, eventType: ev.event, paymentRef: pay.notes?.paymentRef ?? ev.payload.order?.entity.notes?.paymentRef, providerOrderId: pay.order_id, providerPaymentId: pay.id, amount: pay.amount, currency: pay.currency, method: pay.method });
    }
    case "payment.failed":
      return pay ? handleFailure(eventId, ev.event, pay) : { handled: false, reason: "no_payment" };
    case "refund.processed":
    case "refund.failed": {
      const rf = ev.payload.refund?.entity;
      if (!rf) return { handled: false, reason: "no_refund" };
      const payment = await findPayment({ providerPaymentId: rf.payment_id });
      if (!payment) return { handled: false, reason: "payment_not_found" };
      const claimed = await Payment.updateOne({ _id: payment._id, "processedEvents.eventId": { $ne: eventId } }, { $push: { processedEvents: eventClaim(eventId, ev.event) } });
      if (claimed.modifiedCount === 0) return { handled: true, duplicate: true };
      const release = () => Payment.updateOne({ _id: payment._id }, { $pull: { processedEvents: { eventId } } });
      try {
        const entry = payment.refunds.find((r) => r.providerRefundId === rf.id) ?? payment.refunds.find((r) => rf.notes?.refundId && String(r.refundId) === rf.notes.refundId);
        if (entry) {
          if (ev.event === "refund.processed") await markRefundSucceeded(payment._id, entry.refundId, rf.id);
          else await failRefund(payment._id, entry.refundId);
          return { handled: true };
        }
        // No matching entry: e.g. a refund issued from the Razorpay dashboard. Record it (idempotent by provider refund id).
        if (ev.event === "refund.processed") {
          const r = await recordExternalRefund(payment._id, rf.id, rf.amount);
          return { handled: true, reason: r ? "external_refund_recorded" : "external_refund_already_recorded" };
        }
        await release(); // unmatched failure: do NOT consume the event, a later delivery may match
        return { handled: false, reason: "refund_not_found" };
      } catch (e) {
        await release();
        throw e;
      }
    }
    default:
      return { handled: false, reason: "ignored_event" };
  }
}

// ================================================================ refunds (wallet-first)
/**
 * Step 1 of every refund: RESERVE the amount with cumulative validation in ONE atomic update
 * (amountRefunded + amount <= amount paid). Pending + succeeded refunds both count.
 * With `providerRefundId` the call is idempotent: an already-recorded provider refund returns null.
 */
async function reserveRefund(paymentId: Types.ObjectId, amount: number, destination: "wallet" | "original", reason?: string, opts: { status?: "pending" | "succeeded"; providerRefundId?: string } = {}) {
  const refundId = new Types.ObjectId();
  const now = new Date();
  const refund = { refundId, destination, amount, status: opts.status ?? "pending", reason, createdAt: now, ...(opts.providerRefundId ? { providerRefundId: opts.providerRefundId } : {}), ...(opts.status === "succeeded" ? { processedAt: now } : {}) };
  const filter: Record<string, unknown> = { _id: paymentId, status: { $in: ["paid", "partially_refunded"] }, $expr: { $lte: [{ $add: ["$amountRefunded", amount] }, "$amount"] } };
  if (opts.providerRefundId) filter["refunds.providerRefundId"] = { $ne: opts.providerRefundId };
  const updated = await Payment.findOneAndUpdate(
    filter,
    [
      { $set: { amountRefunded: { $add: ["$amountRefunded", amount] }, refunds: { $concatArrays: ["$refunds", [{ $literal: refund }]] } } },
      { $set: { status: { $cond: [{ $gte: ["$amountRefunded", "$amount"] }, "refunded", "partially_refunded"] } } },
    ],
    { new: true },
  ).lean();
  if (!updated) {
    const cur = await Payment.findById(paymentId).lean();
    if (!cur) throw notFound("Payment");
    if (opts.providerRefundId && cur.refunds.some((r) => r.providerRefundId === opts.providerRefundId)) return null;
    throw unprocessable("REFUND_EXCEEDS_PAYMENT", "Refund exceeds the refundable balance or the payment is not refundable");
  }
  if (updated.orderId) await applyRefundToOrder(updated.orderId, updated.amountRefunded, updated.status === "refunded");
  return { refundId, payment: updated as PaymentLean };
}

async function markRefundSucceeded(paymentId: Types.ObjectId, refundId: Types.ObjectId, providerRefundId?: string) {
  await Payment.updateOne({ _id: paymentId, refunds: { $elemMatch: { refundId, status: "pending" } } }, { $set: { "refunds.$.status": "succeeded", "refunds.$.processedAt": new Date(), ...(providerRefundId ? { "refunds.$.providerRefundId": providerRefundId } : {}) } });
}

/**
 * Marks a pending refund failed AND gives its amount back to the refundable balance in ONE atomic pipeline update.
 * (An earlier two-step version could mark the entry failed, crash, and never release the amount - see regression tests.)
 * Idempotent: the filter requires the entry to still be pending.
 */
async function failRefund(paymentId: Types.ObjectId, refundId: Types.ObjectId) {
  const isTarget = { $and: [{ $eq: ["$$this.refundId", refundId] }, { $eq: ["$$this.status", "pending"] }] };
  const after = await Payment.findOneAndUpdate(
    { _id: paymentId, refunds: { $elemMatch: { refundId, status: "pending" } } },
    [
      {
        $set: {
          amountRefunded: { $max: [0, { $subtract: ["$amountRefunded", { $reduce: { input: "$refunds", initialValue: 0, in: { $cond: [isTarget, { $add: ["$$value", "$$this.amount"] }, "$$value"] } } }] }] },
          refunds: { $map: { input: "$refunds", in: { $cond: [isTarget, { $mergeObjects: ["$$this", { status: "failed", processedAt: new Date() }] }, "$$this"] } } },
        },
      },
      { $set: { status: { $cond: [{ $gt: ["$amountRefunded", 0] }, "partially_refunded", "paid"] } } },
    ],
    { new: true },
  ).lean();
  if (after?.orderId) await applyRefundToOrder(after.orderId, after.amountRefunded, false);
  return !!after;
}

/** A refund created OUTSIDE our API (Razorpay dashboard). Recorded once per provider refund id; ignored if it would exceed the payment. */
async function recordExternalRefund(paymentId: Types.ObjectId, providerRefundId: string, amount: number) {
  try {
    return await reserveRefund(paymentId, amount, "original", "Refund issued from Razorpay dashboard", { status: "succeeded", providerRefundId });
  } catch (e) {
    if (e instanceof AppError && e.code === "REFUND_EXCEEDS_PAYMENT") { console.error("[razorpay] external refund exceeds payment", String(paymentId)); return null; }
    throw e;
  }
}

/**
 * Refund to the customer's WALLET (instant, default) or to the ORIGINAL payment method (Razorpay, async via webhook).
 * Wallet-paid payments can only be refunded to the wallet. Wallet top-ups are not refundable here.
 * Safe to retry: the wallet credit is keyed by refundId.
 */
export async function refundPayment(input: RefundInput) {
  await connectDB();
  const d = refundSchema.parse(input);
  const pid = toObjectId(d.paymentId);
  const current = await Payment.findById(pid).lean();
  if (!current) throw notFound("Payment");
  if (current.purpose === "wallet_topup") throw unprocessable("REFUND_NOT_SUPPORTED", "Wallet top-ups cannot be refunded through this endpoint");
  if (d.destination === "original" && current.provider !== "razorpay") throw unprocessable("REFUND_DESTINATION_INVALID", "Wallet payments can only be refunded to the wallet");
  if (d.destination === "original" && !current.providerPaymentId) throw unprocessable("NO_PROVIDER_REFERENCE", "Payment has no Razorpay reference");
  const rzp = d.destination === "original" ? getRazorpay().rzp : undefined; // fail BEFORE reserving if not configured

  const reserved = (await reserveRefund(pid, d.amount, d.destination, d.reason))!;
  const { refundId, payment } = reserved;
  try {
    if (d.destination === "wallet") {
      await creditWallet(payment.customerId, d.amount, { reason: "refund", idempotencyKey: `refund:${refundId}`, orderId: payment.orderId ?? undefined, paymentId: payment._id, refundId, description: d.reason ?? "Order refund" });
      await markRefundSucceeded(pid, refundId);
      await notifyCustomer(payment.customerId, "refundToWallet", { amount: d.amount }, `refund:${refundId}`);
      return { refundId: String(refundId), destination: "wallet" as const, status: "succeeded" as const };
    }
    const r = await rzp!.payments.refund(payment.providerPaymentId!, { amount: d.amount, speed: "normal", receipt: String(refundId), notes: { refundId: String(refundId), paymentRef: payment.paymentRef } });
    await Payment.updateOne({ _id: pid, "refunds.refundId": refundId }, { $set: { "refunds.$.providerRefundId": r.id } });
    return { refundId: String(refundId), destination: "original" as const, status: "pending" as const }; // finalised by refund.processed / refund.failed webhook
  } catch (e) {
    await failRefund(pid, refundId);
    throw e;
  }
}

/**
 * Recovery sweep: wallet refunds that were reserved but whose final "succeeded" mark never happened (crash between steps).
 * Re-running the credit is a no-op thanks to the idempotency key. Safe to run repeatedly.
 */
export async function reconcilePendingWalletRefunds(olderThanMs = 5 * 60_000, now = new Date()): Promise<number> {
  await connectDB();
  const cutoff = new Date(now.getTime() - olderThanMs);
  const stuck = await Payment.find({ refunds: { $elemMatch: { destination: "wallet", status: "pending", createdAt: { $lte: cutoff } } } }).limit(100).lean();
  let n = 0;
  for (const p of stuck) {
    for (const r of p.refunds.filter((x) => x.destination === "wallet" && x.status === "pending" && x.createdAt <= cutoff)) {
      try {
        await creditWallet(p.customerId, r.amount, { reason: "refund", idempotencyKey: `refund:${r.refundId}`, orderId: p.orderId ?? undefined, paymentId: p._id, refundId: r.refundId, description: r.reason ?? "Order refund" });
        await markRefundSucceeded(p._id, r.refundId);
        n++;
      } catch (e) { console.error("[refund-reconcile] failed", String(p._id), e instanceof Error ? e.name : "error"); }
    }
  }
  return n;
}

/** Refunds whatever is still refundable on a payment, to the wallet. */
export async function refundRemainder(paymentId: Types.ObjectId, reason: string) {
  const p = await Payment.findById(paymentId).lean();
  if (!p) return null;
  const remaining = p.amount - p.amountRefunded;
  if (remaining <= 0 || !["paid", "partially_refunded"].includes(p.status)) return null;
  try { return await refundPayment({ paymentId: String(paymentId), amount: remaining, reason, destination: "wallet" }); }
  catch (e) { if (e instanceof AppError && e.code === "REFUND_EXCEEDS_PAYMENT") return null; throw e; } // a concurrent refund already took it
}

/** Cancels an order; if it was paid, the full remaining amount is refunded to the customer's wallet automatically. */
export async function cancelOrderWithRefund(orderId: string, actor: Actor, reason?: string, ownerCustomerId?: string) {
  const order = await cancelOrder(orderId, actor, reason, ownerCustomerId);
  const payment = await settledPayment(order._id, order.paidPaymentId ?? undefined);
  const refund = payment ? await refundRemainder(payment._id, reason ?? "Order cancelled") : null;
  return { orderId: String(order._id), refund };
}

async function settledPayment(orderId: Types.ObjectId, paidPaymentId?: Types.ObjectId) {
  if (paidPaymentId) { const p = await Payment.findById(paidPaymentId).lean(); if (p && ["paid", "partially_refunded", "refunded"].includes(p.status)) return p; }
  return Payment.findOne({ orderId, status: { $in: ["paid", "partially_refunded"] } }).sort({ paidAt: 1 }).lean();
}

/** Admin refund for an order: full remaining amount by default, or a partial amount; wallet (default) or original method. */
export async function refundOrder(orderId: string, opts: { amount?: number; reason?: string; destination?: "wallet" | "original" }) {
  await connectDB();
  const order = await Order.findById(toObjectId(orderId), { paidPaymentId: 1 }).lean();
  if (!order) throw notFound("Order");
  const payment = await settledPayment(order._id, order.paidPaymentId ?? undefined);
  if (!payment) throw conflict("NOTHING_TO_REFUND", "This order has no paid payment");
  const amount = opts.amount ?? payment.amount - payment.amountRefunded;
  if (amount < 1) throw conflict("NOTHING_TO_REFUND", "Nothing left to refund");
  return refundPayment({ paymentId: String(payment._id), amount, reason: opts.reason, destination: opts.destination ?? "wallet" });
}

// ================================================================ wallet top-up
/** Gated (needs Razorpay keys). Creates a top-up payment + Razorpay order; the wallet is credited ONLY after verified capture. */
export async function createWalletTopupOrder(customerId: string, amount: number) {
  await connectDB();
  const env = getEnv();
  if (!Number.isInteger(amount) || amount < env.WALLET_TOPUP_MIN_MINOR || amount > env.WALLET_TOPUP_MAX_MINOR) {
    throw unprocessable("TOPUP_AMOUNT_INVALID", `Top-up must be between ${env.WALLET_TOPUP_MIN_MINOR} and ${env.WALLET_TOPUP_MAX_MINOR} (paise)`);
  }
  const cid = toObjectId(customerId);
  if (!(await Customer.exists({ _id: cid, status: "active" }))) throw new AppError("FORBIDDEN", 403, "Customer account is not active");
  const payment = await Payment.create({
    paymentRef: await nextPaymentRef(),
    purpose: "wallet_topup",
    customerId: cid,
    provider: "razorpay",
    amount,
    currency: "INR",
    paymentMethodType: undefined,
    ...claimLease(),
  });
  try {
    return await createRazorpayOrderForPayment({ customerId: cid, grandTotal: amount, currency: "INR" }, payment as PaymentDoc, payment.claimToken!, { purpose: "wallet_topup" });
  } catch (error) {
    await clearRazorpayClaim(payment._id, payment.claimToken!);
    throw error;
  }
}
