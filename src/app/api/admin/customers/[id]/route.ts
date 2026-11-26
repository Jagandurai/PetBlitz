import { admin, idOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as Cu from "@/services/customer.service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin<{ id: string }>(async ({ params }) => ok(await Cu.getCustomerAdmin(idOf(params.id))));