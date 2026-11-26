import { admin } from "@/lib/route";
import { ok } from "@/lib/http";
import { getDashboard } from "@/services/dashboard.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin(async () => ok(await getDashboard()));
