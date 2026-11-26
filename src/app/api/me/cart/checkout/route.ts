import { NextResponse } from "next/server";
import { customer, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { checkoutCart } from "@/services/cart.service";
import { checkoutSchema } from "@/validations/cart.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Creates the order from the cart (server-side pricing, shipping, GST, coupon). Same idempotencyKey => original order (200). */
export const POST = customer(async ({ req, me }): Promise<NextResponse> => {
  const r = await checkoutCart(me.customerId, await parseBody(req, checkoutSchema));
  return ok(r, r.duplicate ? 200 : 201);
}, { limit: 30 });
