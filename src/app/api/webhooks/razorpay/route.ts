import { NextResponse } from "next/server";
import { handle, ok } from "@/lib/http";
import { verifyRazorpayWebhook } from "@/lib/razorpay";
import { processRazorpayEvent } from "@/services/payment.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Needs RAZORPAY_WEBHOOK_SECRET. The signature is verified on the RAW body before anything else happens. */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const raw = await req.text(); // raw body - never req.json() before verification
    const { event, eventId } = verifyRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"), req.headers.get("x-razorpay-event-id"));
    return ok({ received: true, ...(await processRazorpayEvent(eventId, event)) });
  });
}
