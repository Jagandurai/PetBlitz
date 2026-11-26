import { customer, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { previewCoupon } from "@/services/cart.service";
import { couponPreviewSchema } from "@/validations/cart.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shows what a coupon would take off the cart. Final validation + redemption happen atomically at checkout. */
export const POST = customer(async ({ req, me }) => ok(await previewCoupon(me.customerId, await parseBody(req, couponPreviewSchema))), { limit: 30 });
