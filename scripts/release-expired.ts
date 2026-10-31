import "./_env";
import { disconnectDB } from "@/lib/db/connection";
import { runMaintenance } from "@/services/maintenance.service";

// Run every 5 minutes from cron / a scheduler. Idempotent. See docs/OPERATIONS.md.
(async () => {
  console.log(JSON.stringify(await runMaintenance()));
  await disconnectDB();
})().catch((e) => { console.error("failed:", e instanceof Error ? e.name : "unknown"); process.exit(1); });
