import crypto from "node:crypto";
import Razorpay from "razorpay";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

let client: Razorpay | undefined;

/** Throws unless both key id and secret are configured: no Razorpay call can happen without explicit configuration. */
export function getRazorpay(): { rzp: Razorpay; keyId: string } {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: secret } = getEnv();
  if (!keyId || !secret) throw new AppError("RAZORPAY_NOT_CONFIGURED", 503, "Payments are not configured");
  client ??= new Razorpay({ key_id: keyId, key_secret: secret });
  return { rzp: client, keyId };
}

const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Checkout callback signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). Proves the pair came from Razorpay. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = getEnv().RAZORPAY_KEY_SECRET;
  if (!secret) throw new AppError("RAZORPAY_NOT_CONFIGURED", 503, "Payments are not configured");
  return safeEqualHex(crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex"), signature);
}

export interface RazorpayEvent {
  event: string;
  payload: {
    payment?: { entity: RzpPayment };
    order?: { entity: { id: string; amount: number; amount_paid?: number; currency: string; notes?: Record<string, string> } };
    refund?: { entity: { id: string; payment_id: string; amount: number; status: string; notes?: Record<string, string> } };
  };
}
export interface RzpPayment {
  id: string; order_id?: string; amount: number; currency: string; status: string; method?: string;
  notes?: Record<string, string>; error_code?: string; error_description?: string;
}

/**
 * Webhook verification: HMAC_SHA256(RAW body, webhook secret) must equal the `x-razorpay-signature` header.
 * Must be called with the raw, unparsed request text. Returns the parsed event and Razorpay's unique event id.
 */
export function verifyRazorpayWebhook(rawBody: string, signature: string | null, eventId: string | null): { event: RazorpayEvent; eventId: string } {
  const secret = getEnv().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new AppError("RAZORPAY_NOT_CONFIGURED", 503, "Webhook secret is not configured");
  if (!signature) throw new AppError("INVALID_SIGNATURE", 400, "Missing signature");
  if (!safeEqualHex(crypto.createHmac("sha256", secret).update(rawBody).digest("hex"), signature)) throw new AppError("INVALID_SIGNATURE", 400, "Invalid webhook signature");
  if (!eventId) throw new AppError("INVALID_EVENT", 400, "Missing event id");
  try {
    return { event: JSON.parse(rawBody) as RazorpayEvent, eventId };
  } catch {
    throw new AppError("INVALID_EVENT", 400, "Malformed payload");
  }
}
