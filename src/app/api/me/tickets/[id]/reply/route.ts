import { customer, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as M from "@/services/message.service";
import { replySchema } from "@/validations/message.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = customer<{ id: string }>(async ({ req, me, params }) => ok(await M.addCustomerReply(me.customerId, idOf(params.id), await parseBody(req, replySchema)), 201), { limit: 30 });