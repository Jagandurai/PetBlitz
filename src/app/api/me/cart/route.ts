import { customer } from "@/lib/route";
import { ok } from "@/lib/http";
import * as Cart from "@/services/cart.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live-priced cart (prices/availability come from the catalog, never from stored data). */
export const GET = customer(async ({ me }) => ok(await Cart.getCart(me.customerId)));
export const DELETE = customer(async ({ me }) => { await Cart.clearCart(me.customerId); return ok({ cleared: true }); });
