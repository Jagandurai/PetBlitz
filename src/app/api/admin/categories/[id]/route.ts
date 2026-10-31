import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as C from "@/services/category.service";
import { updateCategorySchema } from "@/validations/category.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };
export const GET = admin<P>(async ({ params }) => ok(await C.getCategoryByIdAdmin(idOf(params.id))));
export const PATCH = admin<P>(async ({ req, actor, params }) => ok(await C.updateCategory(idOf(params.id), await parseBody(req, updateCategorySchema), { actorId: actor.objectId })));
/** Hard delete ONLY when safe (no children, no pets/products, never in an order); otherwise 409 - archive instead. */
export const DELETE = admin<P>(async ({ params }) => ok(await C.deleteCategorySafely(idOf(params.id))));