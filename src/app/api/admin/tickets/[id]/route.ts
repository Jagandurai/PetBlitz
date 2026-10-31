import { admin, idOf, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as M from "@/services/message.service";
import { ticketThreadQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin<{ id: string }>(async ({ req, params }) => ok(await M.getTicketAdmin(idOf(params.id), ticketThreadQuery.parse(queryOf(req)).threadPage)));