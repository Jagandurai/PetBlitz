import { customer, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { confirmRazorpayCheckout } from "@/services/payment.service";
import { razorpayCheckoutSchema } from "@/validations/payment.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Browser callback: verifies the HMAC signature, re-fetches the payment from Razorpay, checks amount/currency, then settles. Webhook remains the source of truth. */
export const POST = customer(async ({ req, me }) => ok(await confirmRazorpayCheckout(me.customerId, await parseBody(req, razorpayCheckoutSchema))), { limit: 30 });