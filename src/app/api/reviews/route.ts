import { enforceRateLimit, handle, ok } from "@/lib/http";
import { queryOf } from "@/lib/route";
import { listPublicReviews } from "@/services/review.service";
import { publicReviewQuery } from "@/validations/review.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: approved reviews only; no customer or order ids are exposed. */
export async function GET(req: Request) {
  return handle(async () => {
    await enforceRateLimit(req, "reviews", 120);
    return ok(await listPublicReviews(publicReviewQuery.parse(queryOf(req))));
  });
}
