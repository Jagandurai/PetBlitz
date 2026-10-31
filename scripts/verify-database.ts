import "./_env";
import { missingEnvNames } from "@/lib/env";
import { disconnectDB, pingDB, supportsTransactions, connectDB } from "@/lib/db/connection";
import { REQUIRED_COLLECTIONS } from "@/models";

(async () => {
  const missing = missingEnvNames().filter((n) => ["MONGODB_URI", "MONGODB_DB_NAME"].includes(n));
  if (missing.length) { console.error("Missing environment variables:", missing.join(", ")); process.exit(1); }
  const ping = await pingDB(); // real round-trip
  const m = await connectDB();
  const existing = new Set((await m.connection.db!.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  console.log(JSON.stringify({
    connected: true, database: ping.database, latencyMs: ping.latencyMs, transactionsSupported: await supportsTransactions(),
    collections: REQUIRED_COLLECTIONS.map((n) => ({ name: n, exists: existing.has(n) })),
  }, null, 2));
  await disconnectDB();
})().catch((e) => {
  console.error("Connection FAILED:", e instanceof Error ? e.name + ": " + e.message : "unknown error"); // AppError text is already sanitized
  process.exit(1);
});
