import { admin, parseBody, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import { createCoupon, listCoupons } from "@/services/coupon.service";
import { couponQuery, couponSchema } from "@/validations/coupon.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin(async ({ req }) => ok(await listCoupons(couponQuery.parse(queryOf(req)))));
export const POST = admin(async ({ req, actor }) => ok(await createCoupon(await parseBody(req, couponSchema), actor.id), 201));
