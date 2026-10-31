import { customer, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { addToCart } from "@/services/cart.service";
import { addCartItemSchema } from "@/validations/cart.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = customer(async ({ req, me }) => ok(await addToCart(me.customerId, await parseBody(req, addCartItemSchema)), 201), { limit: 60 });
