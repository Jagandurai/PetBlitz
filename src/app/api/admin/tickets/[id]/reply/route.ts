import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as M from "@/services/message.service";
import { replySchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = admin<{ id: string }>(async ({ req, actor, params }) => ok(await M.addAdminReply(idOf(params.id), actor.id, await parseBody(req, replySchema)), 201));