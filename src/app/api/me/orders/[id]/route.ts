import { customer, idOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as O from "@/services/order.service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = customer<{ id: string }>(async ({ me, params }) => ok(await O.getOrderForCustomer(me.customerId, idOf(params.id))));