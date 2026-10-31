import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";
import { imageSchema } from "./_shared";

const reviewSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderItemId: { type: Schema.Types.ObjectId, required: true }, // Order.items._id
    targetType: { type: String, enum: ["pet", "product"], required: true },
    petId: { type: Schema.Types.ObjectId, ref: "Pet" },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    title: { type: String, maxlength: 120 },
    comment: { type: String, maxlength: 2000 },
    images: { type: [imageSchema], default: [], validate: [(v: unknown[]) => v.length <= 5, "max 5 images"] },
    status: { type: String, enum: ["pending", "approved", "rejected", "hidden"], default: "pending" },
    moderationReason: { type: String, maxlength: 500 },
    moderatedBy: Schema.Types.ObjectId,
    moderatedAt: Date,
    verifiedPurchase: { type: Boolean, default: false }, // set ONLY by the server
    verifiedAt: Date,
  },
  { timestamps: true },
);

reviewSchema.pre("validate", function (next) {
  if (this.targetType === "pet" && (!this.petId || this.productId)) this.invalidate("petId", "pet review needs petId only");
  if (this.targetType === "product" && (!this.productId || this.petId)) this.invalidate("productId", "product review needs productId only");
  next();
});

reviewSchema.index({ orderItemId: 1, customerId: 1 }, { unique: true }); // one review per purchased item
reviewSchema.index({ productId: 1, status: 1, createdAt: -1 }, { sparse: true });
reviewSchema.index({ petId: 1, status: 1, createdAt: -1 }, { sparse: true });
reviewSchema.index({ status: 1, createdAt: 1 }); // moderation queue
reviewSchema.index({ customerId: 1, createdAt: -1 });

export type ReviewDoc = InferSchemaType<typeof reviewSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const Review: Model<ReviewDoc> = (models.Review as Model<ReviewDoc>) || model<ReviewDoc>("Review", reviewSchema, "reviews");
