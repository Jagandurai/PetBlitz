import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as O from "@/services/order.service";
import { orderNoteSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = admin<{ id: string }>(async ({ req, actor, params }) => ok(await O.setAdminNote(idOf(params.id), (await parseBody(req, orderNoteSchema)).adminNote, { type: "admin", id: actor.id })));