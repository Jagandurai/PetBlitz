import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";

/** Singleton (_id "main"): admin-editable store configuration. Env values are only the fallback defaults. */
const settingsSchema = new Schema(
  {
    _id: { type: String, default: "main" },
    shipping: {
      baseFeeMinor: { type: Number, min: 0 },
      freeAboveMinor: { type: Number, min: 0 }, // free shipping when discounted subtotal >= this (omit = never)
      stateFees: { type: Map, of: Number, default: {} }, // GST state code ("33") -> fee override in paise
    },
    tax: {
      pricesIncludeTax: { type: Boolean, default: false }, // false = prices are tax-EXCLUSIVE (tax added at checkout)
      sellerStateCode: { type: String, maxlength: 2 }, // "33" = Tamil Nadu: decides CGST+SGST vs IGST
      sellerGstin: { type: String, maxlength: 15 },
      legalName: { type: String, maxlength: 160 },
      address: { type: String, maxlength: 400 },
      invoicePrefix: { type: String, default: "PB", maxlength: 8 },
    },
    returns: { windowDays: { type: Number, default: 7, min: 0, max: 60 }, petsReturnable: { type: Boolean, default: false } },
    updatedBy: String,
  },
  { timestamps: true },
);

const cartSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    items: {
      type: [{ key: { type: String, required: true }, itemType: { type: String, enum: ["pet", "product"], required: true }, petId: Schema.Types.ObjectId, productId: Schema.Types.ObjectId, quantity: { type: Number, required: true, min: 1, max: 100 }, addedAt: { type: Date, default: Date.now } }],
      default: [],
      _id: false,
      validate: [(v: unknown[]) => v.length <= 50, "max 50 cart lines"],
    },
  },
  { timestamps: true },
);
cartSchema.index({ customerId: 1 }, { unique: true });
cartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // abandoned carts expire after 90 days

const couponSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 40, match: /^[A-Z0-9_-]{3,40}$/ },
    description: { type: String, maxlength: 200 },
    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true, min: 1 }, // percent (1-100) or paise
    minOrderMinor: { type: Number, default: 0, min: 0 },
    maxDiscountMinor: { type: Number, min: 1 }, // cap for percent coupons
    appliesTo: { type: String, enum: ["all", "products", "pets"], default: "all" },
    startsAt: Date,
    endsAt: Date,
    usageLimit: { type: Number, min: 1 }, // total redemptions (omit = unlimited)
    perCustomerLimit: { type: Number, default: 1, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: String,
  },
  { timestamps: true },
);
couponSchema.index({ code: 1 }, { unique: true });

const redemptionSchema = new Schema(
  { couponId: { type: Schema.Types.ObjectId, ref: "Coupon", required: true }, customerId: { type: Schema.Types.ObjectId, required: true }, orderId: { type: Schema.Types.ObjectId, required: true }, amount: Number },
  { timestamps: { createdAt: true, updatedAt: false } },
);
redemptionSchema.index({ orderId: 1 }, { unique: true }); // one coupon per order; also the idempotency anchor for release
redemptionSchema.index({ couponId: 1, customerId: 1 });

export type SettingsDoc = InferSchemaType<typeof settingsSchema> & { _id: string };
export type CartDoc = InferSchemaType<typeof cartSchema> & { _id: Types.ObjectId };
export type CouponDoc = InferSchemaType<typeof couponSchema> & { _id: Types.ObjectId; createdAt: Date };
export const StoreSettings: Model<SettingsDoc> = (models.StoreSettings as Model<SettingsDoc>) || model<SettingsDoc>("StoreSettings", settingsSchema, "store_settings");
export const Cart: Model<CartDoc> = (models.Cart as Model<CartDoc>) || model<CartDoc>("Cart", cartSchema, "carts");
export const Coupon: Model<CouponDoc> = (models.Coupon as Model<CouponDoc>) || model<CouponDoc>("Coupon", couponSchema, "coupons");
export const CouponRedemption = (models.CouponRedemption as Model<InferSchemaType<typeof redemptionSchema>>) || model("CouponRedemption", redemptionSchema, "coupon_redemptions");
