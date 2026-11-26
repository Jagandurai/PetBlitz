import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as O from "@/services/order.service";
import { adminShippingSchema } from "@/validations/order.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = admin<{ id: string }>(async ({ req, actor, params }) => ok(await O.updateShipping(idOf(params.id), await parseBody(req, adminShippingSchema), { type: "admin", id: actor.id })));