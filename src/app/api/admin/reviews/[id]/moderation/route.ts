import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as R from "@/services/review.service";
import { moderateReviewSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = admin<{ id: string }>(async ({ req, actor, params }) => ok(await R.moderateReview(idOf(params.id), await parseBody(req, moderateReviewSchema), actor.objectId)));