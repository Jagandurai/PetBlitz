import { enforceRateLimit, handle, ok } from "@/lib/http";
import { Ctx } from "@/lib/route";
import { getPublicProductBySlug } from "@/services/product.service";
import { slug } from "@/validations/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx<{ slug: string }>) {
  return handle(async () => {
    await enforceRateLimit(req, "products", 120);
    return ok(await getPublicProductBySlug(slug.parse((await ctx.params).slug)));
  });
}
