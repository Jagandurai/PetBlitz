import { z } from "zod";
import { objectId } from "./common";

export const refundSchema = z
  .object({
    paymentId: objectId,
    amount: z.number().int().min(1),
    reason: z.string().max(300).optional(),
    destination: z.enum(["wallet", "original"]).default("wallet"), // wallet = instant credit
  })
  .strict();

export const razorpayCheckoutSchema = z
  .object({ razorpay_order_id: z.string().min(5).max(100), razorpay_payment_id: z.string().min(5).max(100), razorpay_signature: z.string().min(10).max(200) })
  .strict();

export const walletAdjustSchema = z
  .object({ customerId: objectId, direction: z.enum(["credit", "debit"]), amount: z.number().int().min(1).max(100_000_00), reason: z.string().min(3).max(300), idempotencyKey: z.string().min(8).max(100) })
  .strict();

export type RefundInput = z.input<typeof refundSchema>;
export type RazorpayCheckoutInput = z.input<typeof razorpayCheckoutSchema>;
export type WalletAdjustInput = z.input<typeof walletAdjustSchema>;
