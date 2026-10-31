import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";
import { imageSchema, SLUG_REGEX } from "./_shared";

export const CATEGORY_TYPES = ["dog", "cat", "accessory"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 100, match: SLUG_REGEX },
    /** Previous slugs, kept so old URLs can redirect after a rename. */
    slugHistory: { type: [String], default: [] },
    /** Stable identity for seed records only (null for admin-created categories). */
    seedKey: { type: String, trim: true, maxlength: 60 },
    description: { type: String, maxlength: 2000 },
    type: { type: String, enum: CATEGORY_TYPES, required: true },
    /** SOURCE OF TRUTH for hierarchy. */
    parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    /** DERIVED: depth, root = 1. */
    level: { type: Number, required: true, min: 1, max: 10 },
    /** DERIVED: ancestor ids, root first, excluding self. */
    path: { type: [Schema.Types.ObjectId], default: [] },
    image: { type: imageSchema },
    icon: { type: String, maxlength: 100 },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isVisible: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    seoTitle: { type: String, maxlength: 120 },
    seoDescription: { type: String, maxlength: 320 },
    createdBy: { type: Schema.Types.ObjectId },
    updatedBy: { type: Schema.Types.ObjectId },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

categorySchema.index({ slug: 1 }, { unique: true }); // global slug scope (incl. archived) keeps URLs unambiguous
categorySchema.index({ slugHistory: 1 }); // old-slug redirect lookups
categorySchema.index({ seedKey: 1 }, { unique: true, partialFilterExpression: { seedKey: { $type: "string" } } }); // optional unique
categorySchema.index({ parentId: 1, sortOrder: 1 }); // children listing in order
categorySchema.index({ path: 1 }); // descendant queries: find({ path: id })
categorySchema.index({ isActive: 1, isVisible: 1, archivedAt: 1 }); // public eligibility filter

export type CategoryDoc = InferSchemaType<typeof categorySchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const Category: Model<CategoryDoc> = (models.Category as Model<CategoryDoc>) || model<CategoryDoc>("Category", categorySchema, "categories");
