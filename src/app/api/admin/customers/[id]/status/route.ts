import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as Cu from "@/services/customer.service";
import { customerStatusSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = admin<{ id: string }>(async ({ req, params }) => {
  const b = await parseBody(req, customerStatusSchema);
  await Cu.setCustomerStatus(idOf(params.id), b.status);
  return ok({ status: b.status });
});