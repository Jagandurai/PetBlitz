import { ok } from "@/lib/http";
import { admin, parseBody } from "@/lib/route";
import { saveBanner } from "@/services/banner.service";
import { bannerSchema, bannerSlotSchema } from "@/validations/homepage.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = admin<{ slot: string }>(async ({ req, params }) => ok(await saveBanner(bannerSlotSchema.parse(params.slot), await parseBody(req, bannerSchema))));
