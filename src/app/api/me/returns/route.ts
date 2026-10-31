import { customer, parseBody, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import { createReturn, listCustomerReturns } from "@/services/return.service";
import { createReturnSchema } from "@/validations/return.validation";
import { pageQuery } from "@/validations/admin.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = customer(async ({ req, me }) => { const q = pageQuery.parse(queryOf(req)); return ok(await listCustomerReturns(me.customerId, q.page, q.pageSize)); });
/** Delivered items only, inside the return window. Live animals are excluded unless the store allows it. */
export const POST = customer(async ({ req, me }) => ok(await createReturn(me.customerId, await parseBody(req, createReturnSchema)), 201), { limit: 20 });
