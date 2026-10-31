import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as W from "@/services/wallet.service";
import { reconcileSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Compares balance with the ledger. `{ "fix": true }` rewrites the balance from the ledger when they differ. */
export const POST = admin<{ id: string }>(async ({ req, params }) => ok(await W.reconcileWallet(idOf(params.id), (await parseBody(req, reconcileSchema)).fix === true)));