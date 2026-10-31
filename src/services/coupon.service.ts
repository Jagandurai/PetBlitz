import { Types } from "mongoose";
import { z } from "zod";
import { couponSchema, couponUpdateSchema, couponQuery } from "@/validations/coupon.validation";
import { connectDB } from "@/lib/db/connection";
import { AppError, conflict, isDuplicateKeyError, notFound, unprocessable } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { couponAmount } from "@/lib/pricing";
import { Coupon, CouponDoc, CouponRedemption } from "@/models/Store";


export interface CouponLine { kind: "pet" | "product"; base: number } // base = line value after item discounts (paise)
export interface CouponResult { coupon: CouponDoc; discount: number; eligible: number[] } // eligible[i] = weight of line i

/** Read-only validation + amount. Throws a 422 with a customer-friendly reason. */
export async function evaluateCoupon(codeRaw: string, customerId: Types.ObjectId, lines: CouponLine[], now = new Date()): Promise<CouponResult> {
  await connectDB();
  const code = codeRaw.trim().toUpperCase();
  const c = await Coupon.findOne({ code }).lean();
  const bad = (m: string) => unprocessable("COUPON_INVALID", m);
  if (!c || !c.isActive) throw bad("This coupon code is not valid");
  if (c.startsAt && c.startsAt > now) throw bad("This coupon is not active yet");
  if (c.endsAt && c.endsAt < now) throw bad("This coupon has expired");
  if (c.usageLimit && c.usedCount >= c.usageLimit) throw bad("This coupon has been fully redeemed");
  if ((await CouponRedemption.countDocuments({ couponId: c._id, customerId })) >= c.perCustomerLimit) throw bad("You have already used this coupon");
  const eligible = lines.map((l) => (c.appliesTo === "all" || (c.appliesTo === "products" && l.kind === "product") || (c.appliesTo === "pets" && l.kind === "pet") ? l.base : 0));
  const base = eligible.reduce((a, b) => a + b, 0);
  if (base < c.minOrderMinor) throw bad(`Add items worth ₹${(c.minOrderMinor / 100).toFixed(0)} or more to use this coupon`);
  const discount = couponAmount(c, base);
  if (discount <= 0) throw bad("This coupon does not apply to your items");
  return { coupon: c as CouponDoc, discount, eligible };
}

/** Atomically takes one use (respecting usageLimit under concurrency) and records the redemption (unique per order). */
export async function redeemCoupon(couponId: Types.ObjectId, customerId: Types.ObjectId, orderId: Types.ObjectId, amount: number) {
  await connectDB();
  const took = await Coupon.findOneAndUpdate({ _id: couponId, isActive: true, $or: [{ usageLimit: null }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }] }, { $inc: { usedCount: 1 } }, { new: true }).lean();
  if (!took) throw unprocessable("COUPON_INVALID", "This coupon has been fully redeemed");
  try {
    await CouponRedemption.create({ couponId, customerId, orderId, amount });
  } catch (e) {
    await Coupon.updateOne({ _id: couponId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    if (isDuplicateKeyError(e)) return; // this order already holds a redemption (retry)
    throw e;
  }
}

/** Returns a coupon use when its order is cancelled / fails. Idempotent: only the caller that deletes the redemption decrements. */
export async function releaseCoupon(orderId: Types.ObjectId) {
  await connectDB();
  const r = await CouponRedemption.findOneAndDelete({ orderId }).lean();
  if (r) await Coupon.updateOne({ _id: r.couponId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
}

// ---------------------------------------------------------------- admin
export async function listCoupons(q: z.output<typeof couponQuery>) {
  await connectDB();
  const f = q.q ? { code: new RegExp(`^${q.q.replace(/[^A-Z0-9_-]/g, "")}`) } : {};
  const [items, total] = await Promise.all([Coupon.find(f).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(), Coupon.countDocuments(f)]);
  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}
export async function createCoupon(input: z.input<typeof couponSchema>, actorId: string) {
  await connectDB();
  try { return (await Coupon.create({ ...couponSchema.parse(input), createdBy: actorId })).toObject(); }
  catch (e) { if (isDuplicateKeyError(e)) throw conflict("COUPON_EXISTS", "A coupon with this code already exists"); throw e; }
}
export async function updateCoupon(id: string, input: z.input<typeof couponUpdateSchema>) {
  await connectDB();
  const d = couponUpdateSchema.parse(input);
  const $set: Record<string, unknown> = {}, $unset: Record<string, 1> = {};
  for (const [k, v] of Object.entries(d)) { if (v === null) $unset[k] = 1; else if (v !== undefined) $set[k] = v; }
  const c = await Coupon.findOneAndUpdate({ _id: toObjectId(id) }, { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) }, { new: true }).lean();
  if (!c) throw notFound("Coupon");
  return c;
}
export { AppError };
