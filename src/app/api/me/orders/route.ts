import { customer, parseBody, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import { NextResponse } from "next/server";
import * as O from "@/services/order.service";
import { createOrderSchema } from "@/validations/order.validation";
import { pageQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = customer(async ({ req, me }) => {
  const q = pageQuery.parse(queryOf(req));
  return ok(await O.listCustomerOrders(me.customerId, q.page, q.pageSize));
});

/** Prices, tax, shipping and totals are computed on the server; the body carries only item ids/quantities. Replays with the same idempotencyKey return the original order (200). */
export const POST = customer(async ({ req, me }): Promise<NextResponse> => {
  const r = await O.createOrder(me.customerId, await parseBody(req, createOrderSchema));
  return ok(r, r.duplicate ? 200 : 201);
}, { limit: 30 });