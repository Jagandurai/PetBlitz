import { admin, parseBody, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as S from "@/services/blog.service";
import { adminBlogQuery, createBlogSchema } from "@/validations/blog.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ARTICLE_BYTES = 400_000;

export const GET = admin(async ({ req }) => ok(await S.listBlogsAdmin(adminBlogQuery.parse(queryOf(req)))));
export const POST = admin(async ({ req, actor }) => ok(await S.createBlog(await parseBody(req, createBlogSchema, MAX_ARTICLE_BYTES), actor.objectId), 201));
