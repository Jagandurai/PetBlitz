import { Schema, model, models, Model } from "mongoose";

/** Atomic sequences (order numbers, ticket numbers, pet codes). Justification: Mongo has no native auto-increment. */
const counterSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, required: true, default: 0 } }, { versionKey: false });

export const Counter: Model<{ _id: string; seq: number }> =
  (models.Counter as Model<{ _id: string; seq: number }>) || model("Counter", counterSchema, "counters");
