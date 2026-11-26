import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as S from "@/services/blog.service";
import { updateBlogSchema } from "@/validations/blog.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ARTICLE_BYTES = 400_000;

type P = { id: string };
export const GET = admin<P>(async ({ params }) => ok(await S.getBlogAdmin(idOf(params.id))));
/** Edit any field. `status` publishes ("published"), unpublishes ("draft") or archives ("archived"). */
export const PATCH = admin<P>(async ({ req, actor, params }) => ok(await S.updateBlog(idOf(params.id), await parseBody(req, updateBlogSchema, MAX_ARTICLE_BYTES), actor.objectId)));
export const DELETE = admin<P>(async ({ params }) => ok(await S.deleteBlog(idOf(params.id))));
