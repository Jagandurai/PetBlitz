import { enforceRateLimit, handle, ok } from "@/lib/http";
import { queryOf } from "@/lib/route";
import { getPublicProductsByIds } from "@/services/homepage.service";
import { homeProductsQuery } from "@/validations/homepage.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current details for the products in this browser's "recently viewed" list. Nothing about the visitor is stored. */
export async function GET(req: Request) {
  return handle(async () => {
    await enforceRateLimit(req, "products", 120);
    const { ids } = homeProductsQuery.parse(queryOf(req));
    return ok({ items: await getPublicProductsByIds([...new Set(ids.split(","))]) });
  });
}
