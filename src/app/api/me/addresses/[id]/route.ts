import { customer, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as Cu from "@/services/customer.service";
import { addressSchema } from "@/validations/customer.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };
export const PATCH = customer<P>(async ({ req, me, params }) => {
  await Cu.updateAddress(me.customerId, idOf(params.id), await parseBody(req, addressSchema.partial()));
  return ok({ updated: true });
});
export const DELETE = customer<P>(async ({ me, params }) => {
  await Cu.removeAddress(me.customerId, idOf(params.id));
  return ok({ deleted: true });
});