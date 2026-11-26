import { admin, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { archiveRange } from "@/services/order-history.service";
import { orderArchiveRangeSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = admin(async ({ req }) => { const { archived, ...range } = await parseBody(req, orderArchiveRangeSchema); return ok(await archiveRange(range, archived)); });
