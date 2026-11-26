import { admin, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { deleteRange } from "@/services/order-history.service";
import { orderDeleteRangeSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = admin(async ({ req }) => ok(await deleteRange(await parseBody(req, orderDeleteRangeSchema))));
