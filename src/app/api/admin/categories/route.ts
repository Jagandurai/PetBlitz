import { admin, parseBody, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as C from "@/services/category.service";
import { createCategorySchema } from "@/validations/category.validation";
import { adminCategoryQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin view: includes hidden, inactive and (optionally) archived categories. `?flat=true` returns a flat list. */
export const GET = admin(async ({ req }) => {
  const q = adminCategoryQuery.parse(queryOf(req));
  if (q.flat === "true" || q.parentId) {
    return ok({ categories: await C.listCategoriesAdmin({ includeArchived: q.includeArchived === "true", parentId: q.parentId === undefined ? undefined : q.parentId === "root" ? null : q.parentId }) });
  }
  return ok({ tree: await C.getCategoryTree({ scope: "admin" }) });
});

export const POST = admin(async ({ req, actor }) => ok(await C.createCategory(await parseBody(req, createCategorySchema), { actorId: actor.objectId }), 201));