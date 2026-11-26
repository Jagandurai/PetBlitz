import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { setOrderArchived } from "@/services/order-history.service";
import { orderArchiveSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = admin<{ id: string }>(async ({ req, params }) => ok(await setOrderArchived(idOf(params.id), (await parseBody(req, orderArchiveSchema)).archived)));
