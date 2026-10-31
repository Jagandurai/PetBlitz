import { admin, idOf, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as W from "@/services/wallet.service";
import { statementQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin<{ id: string }>(async ({ req, params }) => {
  const q = statementQuery.parse(queryOf(req));
  return ok(await W.getWallet(idOf(params.id), q.page, q.pageSize, { admin: true }));
});