import { admin, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as R from "@/services/review.service";
import { adminReviewQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin(async ({ req }) => ok(await R.listReviewsAdmin(adminReviewQuery.parse(queryOf(req)))));