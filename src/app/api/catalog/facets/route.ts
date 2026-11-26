import { enforceRateLimit, handle, ok } from "@/lib/http";
import { queryOf } from "@/lib/route";
import { getFacets } from "@/services/catalog.service";
import { facetsQuery } from "@/validations/catalog.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public. Sidebar filter options (brands, compatibility, price range) from live catalog data. */
export async function GET(req: Request) {
  return handle(async () => {
    await enforceRateLimit(req, "facets", 120);
    return ok(await getFacets(facetsQuery.parse(queryOf(req))));
  });
}
