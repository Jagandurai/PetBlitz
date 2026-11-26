import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as M from "@/services/message.service";
import { ticketStatusSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = admin<{ id: string }>(async ({ req, params }) => {
  const b = await parseBody(req, ticketStatusSchema);
  await M.setTicketStatus(idOf(params.id), b.status);
  return ok({ status: b.status });
});