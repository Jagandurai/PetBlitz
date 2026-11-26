import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyCheckoutSignature, verifyRazorpayWebhook } from "@/lib/razorpay";
import { refundSchema, walletAdjustSchema } from "@/validations/payment.validation";

process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_rzp_test";

describe("razorpay signatures", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: {} });
  const sign = (b: string) => crypto.createHmac("sha256", "whsec_rzp_test").update(b).digest("hex");
  it("webhook: rejects missing/invalid/tampered signatures, accepts a valid one", () => {
    expect(() => verifyRazorpayWebhook(body, null, "e1")).toThrow(/signature/i);
    expect(() => verifyRazorpayWebhook(body, "deadbeef", "e1")).toThrow(/signature/i);
    expect(() => verifyRazorpayWebhook(body + " ", sign(body), "e1")).toThrow();
    expect(verifyRazorpayWebhook(body, sign(body), "e1").eventId).toBe("e1");
    expect(() => verifyRazorpayWebhook(body, sign(body), null)).toThrow();
  });
  it("checkout: validates HMAC(order|payment)", () => {
    const good = crypto.createHmac("sha256", "test_key_secret").update("order_1|pay_1").digest("hex");
    expect(verifyCheckoutSignature("order_1", "pay_1", good)).toBe(true);
    expect(verifyCheckoutSignature("order_1", "pay_2", good)).toBe(false);
  });
});

describe("refund/wallet input", () => {
  const id = "507f1f77bcf86cd799439011";
  it("defaults to wallet; rejects bad amounts and unknown fields", () => {
    expect(refundSchema.parse({ paymentId: id, amount: 100 }).destination).toBe("wallet");
    expect(refundSchema.safeParse({ paymentId: id, amount: 0 }).success).toBe(false);
    expect(refundSchema.safeParse({ paymentId: id, amount: 1.5 }).success).toBe(false);
    expect(refundSchema.safeParse({ paymentId: id, amount: 1, destination: "bank" }).success).toBe(false);
    expect(walletAdjustSchema.safeParse({ customerId: id, direction: "credit", amount: -5, reason: "abc", idempotencyKey: "12345678" }).success).toBe(false);
  });
});
