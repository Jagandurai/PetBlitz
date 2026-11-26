import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as S from "@/services/product.service";
import { stockSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Atomic: never below zero or below stock reserved by open orders. mode "set" => absolute; "adjust" => +/- delta. */
export const POST = admin<{ id: string }>(async ({ req, actor, params }) => ok(await S.adjustStock(idOf(params.id), await parseBody(req, stockSchema), actor.objectId)));