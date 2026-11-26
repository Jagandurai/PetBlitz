import { admin, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as O from "@/services/order.service";
import { adminOrderQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin(async ({ req }) => ok(await O.listOrdersAdmin(adminOrderQuery.parse(queryOf(req)))));