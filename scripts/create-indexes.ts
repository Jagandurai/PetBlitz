import "./_env";
import { disconnectDB } from "@/lib/db/connection";
import { createAllIndexes, findUniqueConflicts } from "@/lib/db/indexes";

const dry = process.argv.includes("--dry-run");
(async () => {
  const conflicts = await findUniqueConflicts();
  const results = await createAllIndexes({ dryRun: dry });
  console.log(JSON.stringify({ dryRun: dry, uniqueConflicts: conflicts, results }, null, 2));
  await disconnectDB();
  if (conflicts.length || results.some((r) => r.error)) process.exit(2);
})().catch(async (e) => {
  console.error("Index creation failed:", e instanceof Error ? e.message.replace(/mongodb(\+srv)?:\/\/\S+/gi, "[redacted]") : "unknown");
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
