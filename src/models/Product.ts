import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";
import { calcFinalPrice } from "@/lib/money";
import { DISCOUNT_TYPES, mediaSchema, ratingSummarySchema, SLUG_REGEX } from "./_shared";

export const PRODUCT_COMPAT = ["dog", "cat"] as const;

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180, match: SLUG_REGEX },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 60 },
    shortDescription: { type: String, maxlength: 300 },
    description: { type: String, maxlength: 5000 },
    extraDescriptions: {
      type: [{ shortDescription: { type: String, trim: true, maxlength: 300 }, description: { type: String, maxlength: 5000 } }],
      default: [],
    },
    productType: { type: String, trim: true, maxlength: 80 }, // free text, admin-defined (not an enum)
    hsnCode: { type: String, trim: true, maxlength: 8 }, // GST HSN (printed on invoices)
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    subcategoryId: { type: Schema.Types.ObjectId, ref: "Category" },

    compatibility: { type: [String], enum: PRODUCT_COMPAT, validate: [(v: string[]) => v.length > 0, "at least one of dog/cat"] },
    brand: { type: String, trim: true, maxlength: 80 },
    specifications: { type: [{ key: { type: String, required: true, maxlength: 60 }, value: { type: String, required: true, maxlength: 200 } }], default: [] },
    material: { type: String, maxlength: 100 },
    colors: { type: [String], default: [] },
    sizes: { type: [String], default: [] },
    media: { type: [mediaSchema], default: [] },

    price: { type: Number, required: true, min: 0, validate: Number.isInteger },
    discountType: { type: String, enum: DISCOUNT_TYPES, default: "none" },
    discountValue: { type: Number, default: 0, min: 0 },
    finalPrice: { type: Number, min: 0 },
    currency: { type: String, default: "INR", uppercase: true, minlength: 3, maxlength: 3 },
    taxCategory: { type: String, default: "standard", maxlength: 40 },
    taxRateBps: { type: Number, default: 0, min: 0, max: 10000 },

    trackInventory: { type: Boolean, default: true },
    stockQuantity: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    reservedQuantity: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    backorderPolicy: { type: String, enum: ["deny", "allow"], default: "deny" },
    weightGrams: { type: Number, min: 0 },
    dimensionsCm: { length: { type: Number, min: 0 }, width: { type: Number, min: 0 }, height: { type: Number, min: 0 } },

    isFeatured: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    isVisible: { type: Boolean, default: true },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft" },
    publishedAt: Date,
    seoTitle: { type: String, maxlength: 120 },
    seoDescription: { type: String, maxlength: 320 },
    ratingSummary: { type: ratingSummarySchema, default: () => ({ count: 0, sum: 0 }) },
    createdBy: Schema.Types.ObjectId,
    updatedBy: Schema.Types.ObjectId,
  },
  { timestamps: true },
);

// Derived values (availableQuantity, stockStatus) are computed in lib/inventory.ts, never stored, so they cannot drift.
productSchema.pre("validate", function (next) {
  try {
    this.finalPrice = calcFinalPrice(this.price, this.discountType as "none" | "percent" | "fixed", this.discountValue ?? 0);
  } catch (e) {
    this.invalidate("discountValue", (e as Error).message);
  }
  if (this.trackInventory && this.reservedQuantity > this.stockQuantity && this.backorderPolicy === "deny") {
    this.invalidate("reservedQuantity", "reservedQuantity cannot exceed stockQuantity");
  }
  if (this.status === "published") {
    if (!this.description || this.description.trim().length < 10) this.invalidate("description", "Published products need a description");
    if (!(this.price > 0)) this.invalidate("price", "Published products need a price greater than zero");
    if (!(this.media ?? []).some((m) => m.kind === "image")) this.invalidate("media", "Published products need at least one image");
  }
  next();
});

productSchema.index({ name: "text", brand: "text", description: "text" }, { name: "product_text", weights: { name: 10, brand: 5, description: 1 } }); // public search
productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ sku: 1 }, { unique: true });
productSchema.index({ status: 1, isVisible: 1, categoryId: 1, finalPrice: 1 }); // public listing
productSchema.index({ categoryId: 1 });
productSchema.index({ subcategoryId: 1 }, { sparse: true });
productSchema.index({ brand: 1 }, { sparse: true });
productSchema.index({ isFeatured: 1, status: 1, createdAt: -1 });

export type ProductDoc = InferSchemaType<typeof productSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const Product: Model<ProductDoc> = (models.Product as Model<ProductDoc>) || model<ProductDoc>("Product", productSchema, "products");
