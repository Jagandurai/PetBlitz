import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { actOnReturn } from "@/services/return.service";
import { returnActionSchema } from "@/validations/return.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** approve | reject | receive | close (state machine enforced). The customer is e-mailed. */
export const POST = admin<{ id: string }>(async ({ req, actor, params }) => ok(await actOnReturn(idOf(params.id), await parseBody(req, returnActionSchema), actor.id)));
