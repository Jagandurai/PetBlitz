import { customer, idOf } from "@/lib/route";
import { ok } from "@/lib/http";
import { createRazorpayOrder } from "@/services/payment.service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns { keyId, razorpayOrderId, amount, currency } for Razorpay Checkout. Amount comes from the order in the DB. */
export const POST = customer<{ id: string }>(async ({ me, params }) => ok(await createRazorpayOrder(idOf(params.id), me.customerId), 201), { limit: 20 });