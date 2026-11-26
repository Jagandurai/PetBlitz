import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as C from "@/services/category.service";
import { updateCategorySchema } from "@/validations/category.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };
export const GET = admin<P>(async ({ params }) => ok(await C.getCategoryByIdAdmin(idOf(params.id))));
export const PATCH = admin<P>(async ({ req, actor, params }) => ok(await C.updateCategory(idOf(params.id), await parseBody(req, updateCategorySchema), { actorId: actor.objectId })));
/** Permanent delete (blocked only by order history). `?includeChildren=true` also removes sub-categories; products are kept. */
export const DELETE = admin<P>(async ({ req, params }) => ok(await C.deleteCategorySafely(idOf(params.id), { includeChildren: new URL(req.url).searchParams.get("includeChildren") === "true" })));
