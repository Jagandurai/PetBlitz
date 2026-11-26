import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { deleteCoupon, updateCoupon } from "@/services/coupon.service";
import { couponUpdateSchema } from "@/validations/coupon.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = admin<{ id: string }>(async ({ params }) => ok(await deleteCoupon(idOf(params.id))));
export const PATCH = admin<{ id: string }>(async ({ req, params }) => ok(await updateCoupon(idOf(params.id), await parseBody(req, couponUpdateSchema))));
