import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as O from "@/services/order.service";
import { orderStatusSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Validated state machine + audit entry. To cancel use POST .../cancel (it releases stock and refunds). */
export const POST = admin<{ id: string }>(async ({ req, actor, params }) => {
  const b = await parseBody(req, orderStatusSchema);
  return ok(await O.transitionOrderStatus(idOf(params.id), b.status, { type: "admin", id: actor.id }, b.note));
});