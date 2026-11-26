import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as C from "@/services/category.service";
import { archiveCategorySchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = admin<{ id: string }>(async ({ req, actor, params }) => ok(await C.archiveCategory(idOf(params.id), { ...(await parseBody(req, archiveCategorySchema)), actorId: actor.objectId })));