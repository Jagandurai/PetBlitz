import { requireCron } from "@/lib/auth/guards";
import { handle, ok } from "@/lib/http";
import { runMaintenance } from "@/services/maintenance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Scheduler endpoint (POST, state-changing). Auth: `Authorization: Bearer <CRON_SECRET>` - a separate secret from the admin key. */
export async function POST(req: Request) {
  return handle(async () => {
    requireCron(req);
    return ok(await runMaintenance());
  });
}
