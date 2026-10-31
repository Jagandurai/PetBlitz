import { admin, idOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as O from "@/services/order.service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin<{ id: string }>(async ({ params }) => ok(await O.getOrderAdmin(idOf(params.id))));