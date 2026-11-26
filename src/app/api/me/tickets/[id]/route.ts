import { customer, idOf, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as M from "@/services/message.service";
import { ticketThreadQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = customer<{ id: string }>(async ({ req, me, params }) => ok(await M.getTicketForCustomer(me.customerId, idOf(params.id), ticketThreadQuery.parse(queryOf(req)).threadPage)));