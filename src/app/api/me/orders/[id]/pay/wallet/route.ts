import { customer, idOf } from "@/lib/route";
import { ok } from "@/lib/http";
import { payOrderWithWallet } from "@/services/payment.service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = customer<{ id: string }>(async ({ me, params }) => ok(await payOrderWithWallet(idOf(params.id), me.customerId)), { limit: 20 });