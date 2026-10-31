import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { refundReturn } from "@/services/return.service";
import { returnRefundSchema } from "@/validations/return.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Finance permission. Default amount = proportional line value incl. tax; default destination = wallet. */
export const POST = admin<{ id: string }>(async ({ req, actor, params }) => ok(await refundReturn(idOf(params.id), await parseBody(req, returnRefundSchema), actor.id)));
