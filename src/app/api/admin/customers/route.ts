import { admin, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as Cu from "@/services/customer.service";
import { adminCustomerQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin(async ({ req }) => ok(await Cu.listCustomersAdmin(adminCustomerQuery.parse(queryOf(req)))));