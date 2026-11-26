import { admin, parseBody, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as S from "@/services/product.service";
import { createProductSchema } from "@/validations/product.validation";
import { adminProductQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin(async ({ req }) => ok(await S.listProductsAdmin(adminProductQuery.parse(queryOf(req)))));
export const POST = admin(async ({ req, actor }) => ok(await S.createProduct(await parseBody(req, createProductSchema), actor.objectId), 201));