import { connectDB, pingDB, supportsTransactions } from "@/lib/db/connection";
import { requireAdmin } from "@/lib/auth/guards";
import { handle, ok } from "@/lib/http";
import { REQUIRED_COLLECTIONS } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Protected diagnostics. Performs a REAL ping and lists REAL collections. No connection string or raw errors are returned. */
export async function GET(req: Request) {
  return handle(async () => {
    requireAdmin(req);
    const m = await connectDB();
    const ping = await pingDB();
    const existing = new Set((await m.connection.db!.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    return ok({
      database: ping.database,
      connectionState: "connected",
      latencyMs: ping.latencyMs,
      transactionsSupported: await supportsTransactions(),
      collections: REQUIRED_COLLECTIONS.map((name) => ({ name, exists: existing.has(name) })),
    });
  });
}
