import { customer, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { createReview } from "@/services/review.service";
import { createReviewSchema } from "@/validations/review.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Eligibility (own, paid, delivered order item) and verifiedPurchase are decided server-side. New reviews are "pending" moderation. */
export const POST = customer(async ({ req, me }) => ok(await createReview(me.customerId, await parseBody(req, createReviewSchema)), 201), { limit: 20 });