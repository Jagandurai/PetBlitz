import { ok } from "@/lib/http";
import { admin } from "@/lib/route";
import { getBannerSlots } from "@/services/banner.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin(async () => ok(await getBannerSlots()));
