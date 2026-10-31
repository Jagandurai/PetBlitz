import "./_env";
import fs from "node:fs";
import path from "node:path";
import { connectDB, disconnectDB, supportsTransactions } from "@/lib/db/connection";
import { findUniqueConflicts, ALL_MODELS } from "@/lib/db/indexes";
import { missingEnvNames } from "@/lib/env";
import { REQUIRED_COLLECTIONS } from "@/models";

/** PRIVATE report: run locally / in CI only. Never wire this to an HTTP route. Credentials and hosts are never printed. */
(async () => {
  const m = await connectDB();
  const db = m.connection.db!;
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const collections: unknown[] = [];
  for (const [name, model] of Object.entries(ALL_MODELS)) {
    const exists = existing.has(model.collection.name);
    collections.push({
      name, exists,
      documentCount: exists ? await model.estimatedDocumentCount() : 0,
      indexes: exists ? (await model.collection.indexes()).map((i) => ({ name: i.name, key: i.key, unique: !!i.unique, partialFilterExpression: i.partialFilterExpression })) : [],
      declaredIndexes: (model.schema.indexes() as [Record<string, number>, Record<string, unknown>][]).map(([k, o]) => ({ key: k, unique: !!o.unique })),
      schemaPaths: Object.keys(model.schema.paths).length,
    });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    database: m.connection.name,
    connection: "connected (real ping succeeded)",
    transactionsSupported: await supportsTransactions(),
    requiredCollections: { existing: REQUIRED_COLLECTIONS.filter((c) => existing.has(c)), missing: REQUIRED_COLLECTIONS.filter((c) => !existing.has(c)) },
    collections,
    uniqueIndexConflicts: await findUniqueConflicts(),
    missingEnvironment: missingEnvNames(),
  };
  const text = JSON.stringify(report, null, 2);
  console.log(text);
  if (process.argv.includes("--out")) {
    fs.mkdirSync("reports", { recursive: true });
    const f = path.join("reports", `db-report-${Date.now()}.json`); // /reports is git-ignored
    fs.writeFileSync(f, text);
    console.error("Saved:", f);
  }
  await disconnectDB();
})().catch(async (e) => {
  console.error("Report failed:", e instanceof Error ? e.message.replace(/mongodb(\+srv)?:\/\/\S+/gi, "[redacted]") : "unknown");
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
