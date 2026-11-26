import { Schema } from "mongoose";

const httpUrl = (v: string) => /^https?:\/\//i.test(v); // blocks data: URIs - media binaries never live in MongoDB

export const imageSchema = new Schema(
  {
    url: { type: String, required: true, maxlength: 2048, validate: [httpUrl, "url must be http(s)"] },
    alt: { type: String, maxlength: 200, default: "" },
    storageKey: { type: String, maxlength: 512 },
  },
  { _id: false },
);

export const mediaSchema = new Schema(
  {
    kind: { type: String, enum: ["image", "video"], required: true },
    url: { type: String, required: true, maxlength: 2048, validate: [httpUrl, "url must be http(s)"] },
    alt: { type: String, maxlength: 200, default: "" },
    storageKey: { type: String, maxlength: 512 },
    mimeType: { type: String, maxlength: 100 },
    sortOrder: { type: Number, default: 0 },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true },
);

export const ratingSummarySchema = new Schema(
  { count: { type: Number, default: 0, min: 0 }, sum: { type: Number, default: 0, min: 0 } },
  { _id: false },
);

export const DISCOUNT_TYPES = ["none", "percent", "fixed"] as const;
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
