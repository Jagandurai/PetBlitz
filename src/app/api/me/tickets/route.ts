import { customer, parseBody, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as M from "@/services/message.service";
import { customerTicketSchema } from "@/validations/message.validation";
import { pageQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = customer(async ({ req, me }) => {
  const q = pageQuery.parse(queryOf(req));
  return ok(await M.listCustomerTickets(me.customerId, q.page, q.pageSize));
});
export const POST = customer(async ({ req, me }) => ok(await M.createCustomerTicket(me.customerId, await parseBody(req, customerTicketSchema)), 201), { limit: 20 });