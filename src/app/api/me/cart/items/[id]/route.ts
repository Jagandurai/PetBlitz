import { customer, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { removeFromCart, setCartQuantity } from "@/services/cart.service";
import { setQuantitySchema } from "@/validations/cart.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `id` is the productId (quantity) or the pet/product id (remove). */
export const PATCH = customer<{ id: string }>(async ({ req, me, params }) => ok(await setCartQuantity(me.customerId, idOf(params.id), await parseBody(req, setQuantitySchema))));
export const DELETE = customer<{ id: string }>(async ({ me, params }) => ok(await removeFromCart(me.customerId, idOf(params.id))));
