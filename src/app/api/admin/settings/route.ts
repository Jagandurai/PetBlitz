import { admin, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { getSettings, updateSettings } from "@/services/settings.service";
import { settingsSchema } from "@/validations/settings.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin(async () => ok(await getSettings(true)));
/** Owner only. Shipping rules, GST mode/seller details, return policy. */
export const PATCH = admin(async ({ req, actor }) => ok(await updateSettings(await parseBody(req, settingsSchema), actor.id)));
