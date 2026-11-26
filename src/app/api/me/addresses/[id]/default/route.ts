import { customer, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as Cu from "@/services/customer.service";
import { defaultAddressSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = customer<{ id: string }>(async ({ req, me, params }) => {
  await Cu.setDefaultAddress(me.customerId, idOf(params.id), await parseBody(req, defaultAddressSchema));
  return ok({ updated: true });
});