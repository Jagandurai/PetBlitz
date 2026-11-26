import { admin, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import { listReturnsAdmin } from "@/services/return.service";
import { returnQuery } from "@/validations/return.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin(async ({ req }) => ok(await listReturnsAdmin(returnQuery.parse(queryOf(req)))));
