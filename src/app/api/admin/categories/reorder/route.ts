import { admin, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as C from "@/services/category.service";
import { reorderCategoriesSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = admin(async ({ req }) => {
  const b = await parseBody(req, reorderCategoriesSchema);
  await C.reorderCategories(b.parentId, b.orderedIds);
  return ok({ reordered: b.orderedIds.length });
});