import { enforceRateLimit, handle, ok } from "@/lib/http";
import { Ctx } from "@/lib/route";
import { getPublicBlogBySlug } from "@/services/blog.service";
import { slug } from "@/validations/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public. A published article plus related ones; drafts and archived articles are 404. */
export async function GET(req: Request, ctx: Ctx<{ slug: string }>) {
  return handle(async () => {
    await enforceRateLimit(req, "blog", 120);
    return ok(await getPublicBlogBySlug(slug.parse((await ctx.params).slug)));
  });
}
