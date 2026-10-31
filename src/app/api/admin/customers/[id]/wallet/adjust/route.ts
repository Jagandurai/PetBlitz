import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as W from "@/services/wallet.service";
import { adminWalletAdjustSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ledgered, idempotent (same idempotencyKey => applied once). Debits can never overdraw the wallet. */
export const POST = admin<{ id: string }>(async ({ req, actor, params }) => {
  const b = await parseBody(req, adminWalletAdjustSchema);
  return ok(await W.adminAdjustWallet({ ...b, customerId: idOf(params.id) }, actor.id));
});