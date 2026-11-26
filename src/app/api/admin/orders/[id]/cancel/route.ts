import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { cancelOrderWithRefund } from "@/services/payment.service";
import { orderCancelSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cancels, releases/restocks inventory, and refunds any paid amount to the customer's wallet. Idempotent. */
export const POST = admin<{ id: string }>(async ({ req, actor, params }) => ok(await cancelOrderWithRefund(idOf(params.id), { type: "admin", id: actor.id }, (await parseBody(req, orderCancelSchema)).reason)));