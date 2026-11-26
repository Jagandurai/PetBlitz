import { admin, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as M from "@/services/message.service";
import { adminTicketQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin(async ({ req }) => ok(await M.listTicketsAdmin(adminTicketQuery.parse(queryOf(req)))));