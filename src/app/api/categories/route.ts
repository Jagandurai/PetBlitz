import { enforceRateLimit, handle, ok } from "@/lib/http";
import { notFound } from "@/lib/errors";
import { getCategoryAncestors, getCategoryBySlug, getCategoryChildren, getCategoryTree } from "@/services/category.service";
import { categoryQuerySchema } from "@/validations/category.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, read-only. Data comes exclusively from MongoDB; only publicly-eligible categories are returned. */
export async function GET(req: Request) {
  return handle(async () => {
    await enforceRateLimit(req, "categories", 120);
    const q = categoryQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    if (!q.slug) return ok({ tree: await getCategoryTree({ scope: "public" }) });
    const found = await getCategoryBySlug(q.slug, "public");
    if (!found) throw notFound("Category");
    const [children, breadcrumbs] = await Promise.all([getCategoryChildren(found.category.id, "public"), getCategoryAncestors(found.category.id, "public")]);
    return ok({ category: found.category, canonicalSlug: found.canonicalSlug, redirected: found.redirected, children, breadcrumbs });
  });
}
