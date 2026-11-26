import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { AppError, conflict, isDuplicateKeyError, notFound, unprocessable } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { sanitizeText } from "@/lib/sanitize";
import { Order } from "@/models/Order";
import { Product } from "@/models/Product";
import { Review, ReviewDoc } from "@/models/Review";
import { notifyStore } from "./email.service";
import { CreateReviewInput, createReviewSchema, moderateReviewSchema, publicReviewQuery } from "@/validations/review.validation";
import { pageMeta } from "@/validations/common";

/** Server-side eligibility: the order must belong to the customer, be paid and delivered, and contain the item. */
export async function createReview(customerId: string, input: CreateReviewInput) {
  await connectDB();
  const d = createReviewSchema.parse(input);
  const cid = toObjectId(customerId);
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (d.images?.length && (!cloud || d.images.some((im) => !im.url.startsWith(`https://res.cloudinary.com/${cloud}/`)))) throw unprocessable("IMAGE_HOST_NOT_ALLOWED", "Review photos must be uploaded through PetBlitz");
  const order = await Order.findOne({ _id: toObjectId(d.orderId), customerId: cid }).lean();
  if (!order) throw notFound("Order");
  if (order.status !== "delivered" || !["paid", "partially_refunded"].includes(order.paymentStatus)) throw unprocessable("REVIEW_NOT_ELIGIBLE", "Only delivered, paid orders can be reviewed");
  const item = order.items.find((i) => String(i._id) === d.orderItemId);
  if (!item) throw unprocessable("REVIEW_NOT_ELIGIBLE", "Order item not found");
  if (!item.productId) throw unprocessable("REVIEW_NOT_ELIGIBLE", "This item can no longer be reviewed");
  try {
    const r = await Review.create({
      customerId: cid, orderId: order._id, orderItemId: item._id, targetType: "product", productId: item.productId,
      rating: d.rating, title: d.title ? sanitizeText(d.title) : undefined, comment: d.comment ? sanitizeText(d.comment) : undefined, images: d.images,
      status: "pending", verifiedPurchase: true, verifiedAt: new Date(), // derived here, never from the client
      adminUnread: true,
    });
    await notifyStore("adminNewReview", { product: item.name, rating: d.rating, title: r.title, comment: r.comment, orderNumber: order.orderNumber }, `admin-review:${r._id}`);
    const { adminUnread: _staffOnly, ...review } = r.toObject();
    return review;
  } catch (e) {
    if (isDuplicateKeyError(e)) throw conflict("REVIEW_DUPLICATE", "You have already reviewed this item");
    throw e;
  }
}

/**
 * Moderation. The review's own status is flipped with findOneAndUpdate(new:false) so exactly ONE caller observes any
 * given transition; the rating-summary $inc is derived from that observed transition => accurate under concurrency.
 */
export async function moderateReview(reviewId: string, input: unknown, adminId?: string) {
  await connectDB();
  const d = moderateReviewSchema.parse(input);
  const prev = await Review.findOneAndUpdate(
    { _id: toObjectId(reviewId), status: { $ne: d.status } },
    { $set: { status: d.status, moderationReason: d.reason, moderatedAt: new Date(), ...(adminId && Types.ObjectId.isValid(adminId) ? { moderatedBy: new Types.ObjectId(adminId) } : {}) } },
    { new: false },
  ).lean();
  if (!prev) {
    const cur = await Review.findById(toObjectId(reviewId)).lean();
    if (!cur) throw notFound("Review");
    return cur as ReviewDoc; // already in that status (idempotent)
  }
  const wasApproved = prev.status === "approved";
  const nowApproved = d.status === "approved";
  if (wasApproved !== nowApproved && prev.productId) {
    const sign = nowApproved ? 1 : -1;
    await Product.updateOne({ _id: prev.productId }, { $inc: { "ratingSummary.count": sign, "ratingSummary.sum": sign * prev.rating } });
  }
  return (await Review.findById(prev._id).lean()) as ReviewDoc;
}

/** Recovery: recompute a product's summary from approved reviews. */
export async function recomputeRatingSummary(productId: string) {
  await connectDB();
  const pid = toObjectId(productId);
  const [agg] = await Review.aggregate([{ $match: { targetType: "product", productId: pid, status: "approved" } }, { $group: { _id: null, count: { $sum: 1 }, sum: { $sum: "$rating" } } }]);
  await Product.updateOne({ _id: pid }, { $set: { ratingSummary: { count: agg?.count ?? 0, sum: agg?.sum ?? 0 } } });
}

/** Public: approved reviews only; no customer ids/order ids exposed. */
export async function listPublicReviews(rawQuery: unknown) {
  await connectDB();
  const q = publicReviewQuery.parse(rawQuery);
  const filter = { targetType: q.targetType, productId: toObjectId(q.targetId), status: "approved" };
  const [rows, total] = await Promise.all([
    Review.find(filter, { rating: 1, title: 1, comment: 1, images: 1, verifiedPurchase: 1, createdAt: 1 }).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
    Review.countDocuments(filter),
  ]);
  return { items: rows.map((r) => ({ id: String(r._id), rating: r.rating, title: r.title, comment: r.comment, images: r.images, verifiedPurchase: r.verifiedPurchase, createdAt: r.createdAt })), ...pageMeta(q, total) };
}

export { AppError };

export const countUnreadReviewsAdmin = () => connectDB().then(() => Review.countDocuments({ adminUnread: true }));

export async function listReviewsAdmin(opts: { status?: string; page: number; pageSize: number }) {
  await connectDB();
  const f: Record<string, unknown> = {};
  if (opts.status) f.status = opts.status;
  const [items, total] = await Promise.all([Review.find(f).sort({ createdAt: opts.status === "pending" ? 1 : -1 }).skip((opts.page - 1) * opts.pageSize).limit(opts.pageSize).lean(), Review.countDocuments(f)]);
  // the reviews on screen have now been seen; the returned copies still say "unread" so the page can mark them as new this once
  const fresh = items.filter((r) => r.adminUnread).map((r) => r._id);
  if (fresh.length) await Review.updateMany({ _id: { $in: fresh } }, { $set: { adminUnread: false } }, { timestamps: false });
  return { items, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.max(1, Math.ceil(total / opts.pageSize)) };
}
