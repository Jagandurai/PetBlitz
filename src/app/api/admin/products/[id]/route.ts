import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as S from "@/services/product.service";
import { updateProductSchema } from "@/validations/product.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };
export const GET = admin<P>(async ({ params }) => ok(await S.getProductAdmin(idOf(params.id))));
export const PATCH = admin<P>(async ({ req, actor, params }) => ok(await S.updateProduct(idOf(params.id), await parseBody(req, updateProductSchema), actor.objectId)));