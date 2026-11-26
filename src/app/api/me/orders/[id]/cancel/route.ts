import { customer, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { cancelOrderWithRefund } from "@/services/payment.service";
import { customerCancelSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Allowed only while placed/accepted/confirmed. A paid order is refunded to the wallet automatically. */
export const POST = customer<{ id: string }>(async ({ req, me, params }) =>
  ok(await cancelOrderWithRefund(idOf(params.id), { type: "customer", id: me.customerId }, (await parseBody(req, customerCancelSchema)).reason, me.customerId)));