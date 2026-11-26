import { Schema, model, models, Model, Types } from "mongoose";

/**
 * Promotional banner: one record per fixed storefront position (slot 1-4).
 * Records saved by the earlier advanced editor keep their old fields in MongoDB; banner.service reads them until
 * the slot is saved again. Nothing is migrated or deleted automatically.
 */
const bannerSchema = new Schema(
  {
    slot: { type: Number, required: true, min: 1, max: 4 },
    heading: { type: String, maxlength: 200 },
    paragraph: { type: String, maxlength: 300 },
    imageUrl: { type: String, maxlength: 2048 },
    /** Cloudinary public_id of the image. */
    imageKey: { type: String, maxlength: 512 },
  },
  { timestamps: true },
);
// partial: only records in the simple shape (which always have a heading string) must be unique per slot
bannerSchema.index({ slot: 1 }, { unique: true, partialFilterExpression: { heading: { $type: "string" } } });

export interface BannerDocShape {
  _id: Types.ObjectId; slot: number; heading?: string; paragraph?: string; imageUrl?: string; imageKey?: string; createdAt: Date; updatedAt: Date;
}

export const Banner: Model<BannerDocShape> = (models.Banner as Model<BannerDocShape>) || (model("Banner", bannerSchema, "banners") as unknown as Model<BannerDocShape>);
