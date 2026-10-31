import { admin, idOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as M from "@/services/message.service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Assigns the ticket to the calling admin identity. */
export const POST = admin<{ id: string }>(async ({ actor, params }) => {
  await M.assignTicket(idOf(params.id), actor.objectId);
  return ok({ assignedTo: actor.id });
});