import { enforceRateLimit, handle, ok } from "@/lib/http";
import { listPublicBlogs } from "@/services/blog.service";
import { publicBlogQuery } from "@/validations/blog.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public. Published articles only. */
export async function GET(req: Request) {
  return handle(async () => {
    await enforceRateLimit(req, "blog", 120);
    return ok(await listPublicBlogs(publicBlogQuery.parse(Object.fromEntries(new URL(req.url).searchParams))));
  });
}
