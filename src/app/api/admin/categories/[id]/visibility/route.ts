import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as C from "@/services/category.service";
import { visibilitySchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = admin<{ id: string }>(async ({ req, actor, params }) => ok(await C.setCategoryVisibility(idOf(params.id), (await parseBody(req, visibilitySchema)).isVisible, { actorId: actor.objectId })));