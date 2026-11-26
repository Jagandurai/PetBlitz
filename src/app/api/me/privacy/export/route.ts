import { customer } from "@/lib/route";
import { ok } from "@/lib/http";
import { exportMyData } from "@/services/privacy.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything we hold about you, as JSON (data-portability / access request). */
export const GET = customer(async ({ me }) => ok(await exportMyData(me.customerId)), { limit: 10 });
