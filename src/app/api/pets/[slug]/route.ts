import { enforceRateLimit, handle, ok } from "@/lib/http";
import { Ctx } from "@/lib/route";
import { getPublicPetBySlug } from "@/services/pet.service";
import { slug } from "@/validations/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: Ctx<{ slug: string }>) {
  return handle(async () => {
    await enforceRateLimit(req, "pets", 120);
    return ok(await getPublicPetBySlug(slug.parse((await ctx.params).slug)));
  });
}
