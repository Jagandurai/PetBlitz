import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as C from "@/services/category.service";
import { moveCategorySchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = admin<{ id: string }>(async ({ req, actor, params }) => {
  const b = await parseBody(req, moveCategorySchema);
  return ok(await C.moveCategory(idOf(params.id), b.parentId, { position: b.position, actorId: actor.objectId }));
});