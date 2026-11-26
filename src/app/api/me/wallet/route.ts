import { customer, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as W from "@/services/wallet.service";
import { statementQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Balance (paise) + paginated statement. Only ever the signed-in customer's own wallet. */
export const GET = customer(async ({ req, me }) => {
  const q = statementQuery.parse(queryOf(req));
  return ok(await W.getWallet(me.customerId, q.page, q.pageSize));
});