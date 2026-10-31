import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { cleanDb, HAS_DB, makeUniqueCats, media, setupDb, teardownDb } from "../helpers";
import { Customer } from "@/models/Customer";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { Pet } from "@/models/Pet";
import { Product } from "@/models/Product";
import { Review } from "@/models/Review";
import { Message } from "@/models/Message";
import * as Cust from "@/services/customer.service";
import * as O from "@/services/order.service";
import * as P from "@/services/pet.service";
import * as Prod from "@/services/product.service";
import * as Pay from "@/services/payment.service";
import * as R from "@/services/review.service";
import * as M from "@/services/message.service";
import * as W from "@/services/wallet.service";
import { WalletTransaction } from "@/models/WalletTransaction";
import { createAllIndexes, findUniqueConflicts } from "@/lib/db/indexes";
import * as RazorpayLib from "@/lib/razorpay";
import { nextOrderNumber } from "@/lib/sequence";

const addr = { recipientName: "Asha", phone: "+91 9999999999", line1: "1 Main St", city: "Chennai", state: "TN", postalCode: "600001" };
async function customer(sub = "g-1", email = "a@x.com") {
  const { customer: c } = await Cust.upsertCustomerFromGoogle({ sub, email, email_verified: true, name: "Asha" });
  const addressId = await Cust.addAddress(String(c._id), addr);
  return { id: String(c._id), addressId };
}
async function publishedProduct(categoryId: string, stock = 5, over: Record<string, unknown> = {}) {
  return Prod.createProduct({ name: "Ball", sku: `SKU-${Math.random().toString(36).slice(2, 8)}`, categoryId, compatibility: ["dog"], price: 100000, stockQuantity: stock, description: "A bouncy ball for dogs", media, taxRateBps: 1800, ...over }).then((p) => Prod.setProductPublication(String(p._id), "published"));
}
async function publishedPet(categoryId: string) {
  const p = await P.createPet({ name: "Rex", type: "dog", categoryId, price: 5000000, description: "Friendly labrador puppy, vaccinated.", media });
  return P.setPetPublication(String(p._id), "published");
}

describe.skipIf(!HAS_DB)("commerce integrity (needs MONGODB_TEST_URI)", () => {
  beforeAll(setupDb, 30000);
  beforeEach(cleanDb, 30000);
  afterAll(teardownDb);

  it("payments: wallet top-ups without orderId are excluded from the pending Razorpay uniqueness index", async () => {
    const c = await customer();
    await Payment.insertMany([
      { paymentRef: "TOP-1", orderId: undefined, customerId: new Types.ObjectId(c.id), provider: "razorpay", purpose: "wallet_topup", amount: 1000, currency: "INR", status: "pending" },
      { paymentRef: "TOP-2", orderId: undefined, customerId: new Types.ObjectId(c.id), provider: "razorpay", purpose: "wallet_topup", amount: 2000, currency: "INR", status: "pending" },
    ]);
    const conflicts = await findUniqueConflicts();
    expect(conflicts.some((c) => c.collection === "payments" && c.index === "orderId_provider")).toBe(false);
  });

  it("payments: concurrent Razorpay order requests create only one provider order and leave uncertain retries recoverable", async () => {
    const { toys } = await makeUniqueCats();
    const prod = await publishedProduct(toys.id, 5);
    const c = await customer();
    const { order } = await O.createOrder(c.id, { items: [{ itemType: "product", productId: String(prod._id), quantity: 1 }], shippingAddressId: c.addressId, idempotencyKey: `razorpay-concurrency-${Date.now()}` });

    const createMock = vi.fn(async () => ({ id: "order_rzp_1" }));
    const allMock = vi.fn(async () => ({ items: [] }));
    const getSpy = vi.spyOn(RazorpayLib, "getRazorpay").mockReturnValue({
      keyId: "rzp_test_key",
      rzp: { orders: { create: createMock, all: allMock } },
    } as never);

    try {
      const [first, second] = await Promise.allSettled([
        Pay.createRazorpayOrder(String(order._id), c.id),
        Pay.createRazorpayOrder(String(order._id), c.id),
      ]);
      const fulfilled = [first, second].filter((result) => result.status === "fulfilled");
      const rejected = [first, second].filter((result) => result.status === "rejected");
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const payment = await Payment.findOne({ orderId: order._id, provider: "razorpay" }).lean();
      expect(payment?.providerOrderId).toBe("order_rzp_1");
      expect(await Payment.countDocuments({ orderId: order._id, provider: "razorpay", status: "pending" })).toBe(1);
    } finally {
      getSpy.mockRestore();
    }
  });

  it("payments: duplicate pending Razorpay rows are reported and the index is skipped until reconciled", async () => {
    const { toys } = await makeUniqueCats();
    const prod = await publishedProduct(toys.id, 5);
    const c = await customer();
    const { order } = await O.createOrder(c.id, { items: [{ itemType: "product", productId: String(prod._id), quantity: 1 }], shippingAddressId: c.addressId, idempotencyKey: `razorpay-index-${Date.now()}` });
    const orderId = order._id;
    await Payment.collection.dropIndex("orderId_1_provider_1").catch(() => undefined);
    await Payment.insertMany([
      { paymentRef: "PAY-INDEX-1", orderId, customerId: new Types.ObjectId(c.id), provider: "razorpay", amount: 1000, currency: "INR", status: "pending", claimToken: "tok-1" },
      { paymentRef: "PAY-INDEX-2", orderId, customerId: new Types.ObjectId(c.id), provider: "razorpay", amount: 1000, currency: "INR", status: "pending", claimToken: "tok-2" },
    ]).catch((error) => {
      expect((error as Error).message).toMatch(/duplicate key|E11000/);
    });
    const conflicts = await findUniqueConflicts();
    expect(conflicts.some((report) => report.collection === "payments" && report.index === "orderId_provider")).toBe(true);
    const results = await createAllIndexes({ dryRun: true });
    expect(results.find((r) => r.collection === "payments")?.skippedBecauseOfDuplicates).toBe(true);
    await Payment.deleteMany({ paymentRef: { $in: ["PAY-INDEX-1", "PAY-INDEX-2"] } });
    await createAllIndexes({ dryRun: false });
  });

  it("pets: validates publish rules, category compatibility, private fields", async () => {
    const { lab, toys } = await makeUniqueCats();
    await expect(P.createPet({ name: "Rex", type: "dog", categoryId: toys.id, price: 100 })).rejects.toMatchObject({ code: "CATEGORY_INCOMPATIBLE" });
    const draft = await P.createPet({ name: "Rex", type: "dog", categoryId: lab.id, price: 100, microchipId: "MC-123", health: { internalNotes: "secret", publicDisclosure: "healthy" } });
    await expect(P.setPetPublication(String(draft._id), "published")).rejects.toBeTruthy(); // no media/description
    expect((await P.listPublicPets({})).items).toHaveLength(0); // unpublished excluded
    const pet = await publishedPet(lab.id);
    const list = await P.listPublicPets({});
    expect(list.items).toHaveLength(1);
    const json = JSON.stringify(list);
    expect(json).not.toMatch(/microchip|internalNotes|storageKey|MC-123/);
    expect(pet.finalPrice).toBe(5000000);
  });

  it("pets: cannot be sold twice; reservations expire", async () => {
    const { lab } = await makeUniqueCats();
    const pet = await publishedPet(lab.id);
    const c = await customer();
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map(() => O.createOrder(c.id, { items: [{ itemType: "pet", petId: String(pet._id) }], shippingAddressId: c.addressId, idempotencyKey: `key-${Math.random()}-xxxxxxxx` })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await Pet.updateOne({ _id: pet._id }, { $set: { "reservation.expiresAt": new Date(Date.now() - 1000) } });
    expect(await P.releaseExpiredPetReservations()).toBe(1);
  });

  it("products: concurrent orders never oversell", async () => {
    const { toys } = await makeUniqueCats();
    const prod = await publishedProduct(toys.id, 3);
    const c = await customer();
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => O.createOrder(c.id, { items: [{ itemType: "product", productId: String(prod._id), quantity: 1 }], shippingAddressId: c.addressId, idempotencyKey: `idem-key-${i}-aaaa` })));
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(3);
    const p = await Product.findById(prod._id).lean();
    expect(p!.reservedQuantity).toBe(3);
    expect(p!.stockQuantity).toBe(3);
  });

  it("products: archived excluded; negative stock rejected", async () => {
    const { toys } = await makeUniqueCats();
    const prod = await publishedProduct(toys.id);
    await Prod.setProductPublication(String(prod._id), "archived");
    expect((await Prod.listPublicProducts({})).items).toHaveLength(0);
    await expect(Prod.createProduct({ name: "X", sku: "NEG", categoryId: toys.id, compatibility: ["cat"], price: 1, stockQuantity: -1 })).rejects.toBeTruthy();
  });

  it("customers: duplicate google identity / email link conflict / anonymization", async () => {
    const a = await Cust.upsertCustomerFromGoogle({ sub: "g-1", email: "A@X.com", email_verified: true });
    const again = await Cust.upsertCustomerFromGoogle({ sub: "g-1", email: "a@x.com", email_verified: true });
    expect(again.created).toBe(false);
    expect(await Customer.countDocuments()).toBe(1);
    await expect(Cust.upsertCustomerFromGoogle({ sub: "g-2", email: "a@x.com", email_verified: true })).rejects.toMatchObject({ code: "ACCOUNT_LINK_CONFLICT" });
    await expect(Cust.upsertCustomerFromGoogle({ sub: "g-3", email: "z@x.com", email_verified: false })).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    await expect(Cust.updateOwnProfile(String(a.customer._id), { status: "active" } as never)).rejects.toBeTruthy();
    await Cust.anonymizeCustomer(String(a.customer._id));
    expect((await Customer.findById(a.customer._id).lean())!.email).toContain("@petblitz.invalid");
  });

  it("orders: unique numbers under concurrency, server totals, snapshots, idempotency, scoping", async () => {
    const nums = await Promise.all(Array.from({ length: 25 }, () => nextOrderNumber()));
    expect(new Set(nums).size).toBe(25);

    const { toys } = await makeUniqueCats();
    const prod = await publishedProduct(toys.id, 10);
    const c1 = await customer("g-1", "a@x.com");
    const c2 = await customer("g-2", "b@x.com");
    const input = { items: [{ itemType: "product" as const, productId: String(prod._id), quantity: 2 }], shippingAddressId: c1.addressId, idempotencyKey: "same-key-1234" };
    const [first, second] = await Promise.all([O.createOrder(c1.id, input), O.createOrder(c1.id, input)]);
    expect(await Order.countDocuments()).toBe(1); // duplicate checkout collapsed
    expect([first.duplicate, second.duplicate].sort()).toEqual([false, true]);
    const o = await Order.findOne().lean();
    expect(o!.grandTotal).toBe(2 * 100000 + Math.round((2 * 100000 * 1800) / 10000));
    // historical snapshot survives catalog edits
    await Prod.updateProduct(String(prod._id), { price: 999999, name: "Renamed" });
    expect((await Order.findOne().lean())!.items[0]!.name).toBe("Ball");
    expect((await Order.findOne().lean())!.items[0]!.unitPrice).toBe(100000);
    // customer scoping
    await expect(O.getOrderForCustomer(c2.id, String(o!._id))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(JSON.stringify(await O.getOrderForCustomer(c1.id, String(o!._id)))).not.toContain("adminNote");
    // transitions
    await expect(O.transitionOrderStatus(String(o!._id), "delivered", { type: "admin", id: "a" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(O.transitionOrderStatus(String(o!._id), "accepted", { type: "admin", id: "a" })).resolves.toBeTruthy();
    await expect(O.transitionOrderStatus(String(o!._id), "confirmed", { type: "admin", id: "a" })).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
    // cancellation is idempotent and releases stock exactly once
    await O.cancelOrder(String(o!._id), { type: "admin", id: "a" }, "test");
    await O.cancelOrder(String(o!._id), { type: "admin", id: "a" }, "test");
    expect((await Product.findById(prod._id).lean())!.reservedQuantity).toBe(0);
  });

  async function paidSetup() {
    const { toys } = await makeUniqueCats();
    const prod = await publishedProduct(toys.id, 10, { taxRateBps: 0 });
    const c = await customer();
    const { order } = await O.createOrder(c.id, { items: [{ itemType: "product", productId: String(prod._id), quantity: 1 }], shippingAddressId: c.addressId, idempotencyKey: "pay-key-12345" });
    // simulate the Razorpay order that createRazorpayOrder would have made (no network in tests)
    const payment = await Payment.create({ paymentRef: "PAY-T1", orderId: order._id, customerId: c.id, provider: "razorpay", providerOrderId: "order_TEST1", amount: order.grandTotal, currency: "INR" });
    return { prod, c, order, payment };
  }
  const captured = (payment: { paymentRef: string; amount: number }, over: Record<string, unknown> = {}) => ({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_1", order_id: "order_TEST1", amount: payment.amount, currency: "INR", status: "captured", method: "upi", notes: { paymentRef: payment.paymentRef }, ...over } } },
  });

  it("payments: duplicate webhooks apply once; mismatches rejected; failure cannot undo success", async () => {
    const { prod, order, payment } = await paidSetup();
    const r1 = await Pay.processRazorpayEvent("evt_a", captured(payment));
    const r2 = await Pay.processRazorpayEvent("evt_a", captured(payment));
    const r3 = await Pay.processRazorpayEvent("evt_a2", { event: "order.paid", payload: captured(payment).payload }); // second event type, same payment
    expect(r1.handled).toBe(true);
    expect(r2.duplicate).toBe(true);
    expect(r3.reason).toBe("already_paid");
    expect((await Product.findById(prod._id).lean())!.stockQuantity).toBe(9); // decremented once
    expect((await Order.findById(order._id).lean())!.paymentStatus).toBe("paid");
    await Pay.processRazorpayEvent("evt_b", { event: "payment.failed", payload: { payment: { entity: { id: "pay_1", order_id: "order_TEST1", amount: payment.amount, currency: "INR", status: "failed", error_code: "BAD_REQUEST_ERROR", notes: { paymentRef: payment.paymentRef } } } } });
    expect((await Payment.findById(payment._id).lean())!.status).toBe("paid");
  });

  it("payments: amount/currency mismatch is not applied", async () => {
    const { order, payment } = await paidSetup();
    expect(await Pay.processRazorpayEvent("evt_c", captured(payment, { amount: 1 }))).toMatchObject({ handled: false, reason: "mismatch" });
    expect((await Pay.processRazorpayEvent("evt_d", captured(payment, { currency: "USD" }))).handled).toBe(false);
    expect((await Order.findById(order._id).lean())!.paymentStatus).toBe("pending");
  });

  it("payments: successful event that fails during order settlement remains retryable and applies once", async () => {
    const { c, order, payment, prod } = await paidSetup();
    const markSpy = vi.spyOn(O, "markOrderPaid").mockImplementationOnce(async (orderId, amount, paymentId) => {
      const saved = await Order.findById(orderId).lean();
      if (!saved) throw new Error("order not found");
      throw new Error("settlement blew up");
    });

    try {
      await expect(Pay.processRazorpayEvent("evt_partial", captured(payment))).rejects.toThrow("settlement blew up");
      const afterFailure = await Payment.findById(payment._id).lean();
      expect(afterFailure!.status).toBe("pending");
      expect(afterFailure!.processedEvents.some((e) => e.eventId === "evt_partial")).toBe(false);
      expect((await Order.findById(order._id).lean())!.paymentStatus).toBe("pending");
      expect((await Product.findById(prod._id).lean())!.stockQuantity).toBe(10);

      const retry = await Pay.processRazorpayEvent("evt_partial", captured(payment));
      expect(retry.handled).toBe(true);
      const saved = await Payment.findById(payment._id).lean();
      expect(saved!.status).toBe("paid");
      expect(saved!.providerPaymentId).toBe("pay_1");
      expect(saved!.processedEvents.filter((e) => e.eventId === "evt_partial")).toHaveLength(1);
      expect((await Order.findById(order._id).lean())!.paymentStatus).toBe("paid");
      expect((await Product.findById(prod._id).lean())!.stockQuantity).toBe(9);
      expect((await W.getWallet(c.id)).balance).toBe(0);
      expect((await W.reconcileWallet(c.id)).consistent).toBe(true);

      const duplicate = await Pay.processRazorpayEvent("evt_partial", captured(payment));
      expect(duplicate).toMatchObject({ handled: true, duplicate: true });
      const finalPayment = (await Payment.findById(payment._id).lean())!;
      expect(finalPayment.status).toBe("paid");
      expect(finalPayment.processedEvents.filter((e) => e.eventId === "evt_partial")).toHaveLength(1);
      expect((await Product.findById(prod._id).lean())!.stockQuantity).toBe(9);
      expect((await Order.findById(order._id).lean())!.paymentStatus).toBe("paid");
    } finally {
      markSpy.mockRestore();
    }
  });

  it("refunds go to the WALLET: credited once, cumulative-validated, ledgered", async () => {
    const { c, order, payment } = await paidSetup();
    await Pay.processRazorpayEvent("evt_e", captured(payment));
    const pid = String(payment._id);
    await Pay.refundPayment({ paymentId: pid, amount: payment.amount - 100, destination: "wallet" });
    expect((await W.getWallet(c.id)).balance).toBe(payment.amount - 100);
    await expect(Pay.refundPayment({ paymentId: pid, amount: 101, destination: "wallet" })).rejects.toMatchObject({ code: "REFUND_EXCEEDS_PAYMENT" });
    await Pay.refundPayment({ paymentId: pid, amount: 100, destination: "wallet" });
    expect((await Payment.findById(payment._id).lean())!.status).toBe("refunded");
    expect((await Order.findById(order._id).lean())!.paymentStatus).toBe("refunded");
    const w = await W.getWallet(c.id);
    expect(w.balance).toBe(payment.amount);
    expect(w.transactions.every((t) => t.type === "credit" && t.reason === "refund")).toBe(true);
    expect((await W.reconcileWallet(c.id)).consistent).toBe(true);
  });

  it("cancelling a PAID order refunds the full amount to the wallet and restocks, idempotently", async () => {
    const { c, order, payment, prod } = await paidSetup();
    await Pay.processRazorpayEvent("evt_f", captured(payment));
    await Pay.cancelOrderWithRefund(String(order._id), { type: "customer", id: c.id }, "changed mind", c.id);
    await Pay.cancelOrderWithRefund(String(order._id), { type: "customer", id: c.id }, "changed mind", c.id); // retry
    expect((await W.getWallet(c.id)).balance).toBe(payment.amount); // exactly once
    expect((await Product.findById(prod._id).lean())!.stockQuantity).toBe(10);
  });

  it("payment captured AFTER cancellation is auto-refunded to the wallet", async () => {
    const { c, order, payment } = await paidSetup();
    await O.cancelOrder(String(order._id), { type: "customer", id: c.id }, "x", c.id);
    await Pay.processRazorpayEvent("evt_g", captured(payment));
    expect((await W.getWallet(c.id)).balance).toBe(payment.amount);
  });

  it("wallet: concurrent debits never overdraw; duplicate keys apply once; pay-with-wallet works", async () => {
    const { c } = await paidSetup();
    await W.creditWallet(c.id, 1000, { reason: "topup", idempotencyKey: "k-credit-1" });
    await W.creditWallet(c.id, 1000, { reason: "topup", idempotencyKey: "k-credit-1" }); // duplicate
    expect((await W.getWallet(c.id)).balance).toBe(1000);
    const res = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => W.debitWallet(c.id, 400, { reason: "admin_adjustment", idempotencyKey: `k-debit-${i}` })));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((await W.getWallet(c.id)).balance).toBe(200);
    expect(await WalletTransaction.countDocuments()).toBe(3);
    expect((await W.reconcileWallet(c.id)).consistent).toBe(true);
  });

  it("pay with wallet: debits once, marks order paid; insufficient balance rejected", async () => {
    const { c, order } = await paidSetup();
    await expect(Pay.payOrderWithWallet(String(order._id), c.id)).rejects.toMatchObject({ code: "INSUFFICIENT_WALLET_BALANCE" });
    const grand = (await Order.findById(order._id).lean())!.grandTotal;
    await W.creditWallet(c.id, grand + 50, { reason: "topup", idempotencyKey: "k-topup-xx" });
    await Pay.payOrderWithWallet(String(order._id), c.id);
    expect((await Order.findById(order._id).lean())!.paymentStatus).toBe("paid");
    expect((await W.getWallet(c.id)).balance).toBe(50);
    await expect(Pay.payOrderWithWallet(String(order._id), c.id)).rejects.toMatchObject({ code: "ORDER_NOT_PAYABLE" });
  });

  it("reviews: eligibility, duplicates, approved-only, summary accuracy", async () => {
    const { prod, c, order } = await paidSetup();
    const itemId = String((await Order.findById(order._id).lean())!.items[0]!._id);
    await expect(R.createReview(c.id, { orderId: String(order._id), orderItemId: itemId, rating: 5 })).rejects.toMatchObject({ code: "REVIEW_NOT_ELIGIBLE" });
    await Order.updateOne({ _id: order._id }, { $set: { status: "delivered", paymentStatus: "paid" } });
    const rev = await R.createReview(c.id, { orderId: String(order._id), orderItemId: itemId, rating: 4, comment: "<b>great</b>" });
    expect(rev.verifiedPurchase).toBe(true);
    expect(rev.comment).toBe("great");
    await expect(R.createReview(c.id, { orderId: String(order._id), orderItemId: itemId, rating: 4 })).rejects.toMatchObject({ code: "REVIEW_DUPLICATE" });
    const q = { targetType: "product", targetId: String(prod._id) };
    expect((await R.listPublicReviews(q)).items).toHaveLength(0);
    await Promise.all([R.moderateReview(String(rev._id), { status: "approved" }), R.moderateReview(String(rev._id), { status: "approved" })]);
    expect((await R.listPublicReviews(q)).items).toHaveLength(1);
    expect((await Product.findById(prod._id).lean())!.ratingSummary).toMatchObject({ count: 1, sum: 4 });
    await R.moderateReview(String(rev._id), { status: "hidden" });
    expect((await Product.findById(prod._id).lean())!.ratingSummary).toMatchObject({ count: 0, sum: 0 });
    expect(await Review.countDocuments()).toBe(1);
  });

  it("messages: scoping, validation, thread cap", async () => {
    const c1 = await customer("g-1", "a@x.com");
    const c2 = await customer("g-2", "b@x.com");
    const t = await M.createCustomerTicket(c1.id, { subject: "Where is my order", body: "Please help" });
    await expect(M.getTicketForCustomer(c2.id, t.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(M.addCustomerReply(c2.id, t.id, { body: "hi" })).rejects.toMatchObject({ code: "TICKET_UNAVAILABLE" });
    await expect(M.createPublicTicket({ name: "G", email: "g@x.com", subject: "Hello", body: "short", website: "" })).rejects.toBeTruthy();
    const pub = await M.createPublicTicket({ name: "G", email: "g@x.com", subject: "Hello there", body: "<script>x</script>Need help with delivery" });
    expect(pub.ticketNumber).toMatch(/^TKT-/);
    expect((await Message.findOne({ ticketNumber: pub.ticketNumber }).lean())!.thread[0]!.body).toBe("xNeed help with delivery");
    await Message.updateOne({ _id: t.id }, { $set: { messageCount: 200 } });
    await expect(M.addCustomerReply(c1.id, t.id, { body: "one more" })).rejects.toMatchObject({ code: "TICKET_UNAVAILABLE" });
  });
});
