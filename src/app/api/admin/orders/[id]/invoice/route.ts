import { admin, idOf } from "@/lib/route";
import { ok } from "@/lib/http";
import { ensureInvoice } from "@/services/invoice.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Issues the GST invoice if missing (idempotent: one per order) and returns it. */
export const POST = admin<{ id: string }>(async ({ params }) => ok(await ensureInvoice(idOf(params.id)), 201));
