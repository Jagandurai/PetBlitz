import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";
import { imageSchema, SLUG_REGEX } from "./_shared";

export const BLOG_STATUS = ["draft", "published", "archived"] as const;
export type BlogStatus = (typeof BLOG_STATUS)[number];

const blogSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180, match: SLUG_REGEX },
    excerpt: { type: String, trim: true, maxlength: 400 },
    coverImage: { type: imageSchema },
    author: { type: String, trim: true, maxlength: 80 },
    category: { type: String, trim: true, maxlength: 60 },
    tags: { type: [String], default: [] },
    /** Rich text as a structured document (never HTML). Allowlisted by validations/blog.validation.ts before saving. */
    content: { type: Schema.Types.Mixed, default: () => ({ type: "doc", content: [] }) },
    readingMinutes: { type: Number, default: 1, min: 1 }, // derived from content by the service
    isFeatured: { type: Boolean, default: false },
    status: { type: String, enum: BLOG_STATUS, default: "draft" },
    publishedAt: Date, // first publication
    seoTitle: { type: String, trim: true, maxlength: 120 },
    seoDescription: { type: String, trim: true, maxlength: 320 },
    createdBy: Schema.Types.ObjectId,
    updatedBy: Schema.Types.ObjectId,
  },
  { timestamps: true, minimize: false },
);

blogSchema.index({ slug: 1 }, { unique: true });
blogSchema.index({ status: 1, publishedAt: -1 }); // public listing
blogSchema.index({ status: 1, category: 1, publishedAt: -1 });

export type BlogDoc = InferSchemaType<typeof blogSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const Blog: Model<BlogDoc> = (models.Blog as Model<BlogDoc>) || model<BlogDoc>("Blog", blogSchema, "blogs");
