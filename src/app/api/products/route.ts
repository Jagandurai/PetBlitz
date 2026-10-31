import { enforceRateLimit, handle, ok } from "@/lib/http";
import { listPublicProducts } from "@/services/product.service";
import { productListQuery } from "@/validations/product.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    await enforceRateLimit(req, "products", 120);
    return ok(await listPublicProducts(productListQuery.parse(Object.fromEntries(new URL(req.url).searchParams))));
  });
}
