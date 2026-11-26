import { enforceRateLimit, handle, ok } from "@/lib/http";
import { getPublicSettings } from "@/services/settings.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Storefront config: tax mode, shipping fee/free-shipping threshold, return window. No GSTIN/addresses. */
export async function GET(req: Request) {
  return handle(async () => { await enforceRateLimit(req, "settings", 120); return ok(await getPublicSettings()); });
}
