import { customer, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { quoteCart } from "@/services/cart.service";
import { quoteSchema } from "@/validations/cart.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exact totals for the cart (shipping for the chosen address, GST, coupon). Read-only: nothing is reserved. POST because it takes a body. */
export const POST = customer(async ({ req, me }) => ok(await quoteCart(me.customerId, await parseBody(req, quoteSchema))), { limit: 60 });
