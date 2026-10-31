import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { refundOrder } from "@/services/payment.service";
import { orderRefundSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Omit `amount` to refund the full remaining balance. destination: "wallet" (default, instant) | "original" (Razorpay). */
export const POST = admin<{ id: string }>(async ({ req, params }) => ok(await refundOrder(idOf(params.id), await parseBody(req, orderRefundSchema))));