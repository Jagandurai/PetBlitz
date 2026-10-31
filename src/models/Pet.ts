import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";
import { calcFinalPrice } from "@/lib/money";
import { DISCOUNT_TYPES, mediaSchema, ratingSummarySchema, SLUG_REGEX } from "./_shared";

export const PET_TYPES = ["dog", "cat"] as const; // ONLY dogs and cats
export const AVAILABILITY = ["available", "reserved", "sold", "unavailable"] as const;
export const PUBLICATION_STATUS = ["draft", "published", "archived"] as const;

const vaccinationRecord = new Schema(
  { name: { type: String, required: true, maxlength: 120 }, date: Date, nextDueDate: Date, veterinarianName: { type: String, maxlength: 120 } },
  { _id: true },
);

const petSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 140, match: SLUG_REGEX },
    petCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    type: { type: String, enum: PET_TYPES, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    breed: { type: String, trim: true, maxlength: 100 },
    shortDescription: { type: String, maxlength: 300 },
    description: { type: String, maxlength: 5000 },
    // extra short description + description blocks added from the admin form
    extraDescriptions: {
      type: [{ shortDescription: { type: String, trim: true, maxlength: 300 }, description: { type: String, maxlength: 5000 } }],
      default: [],
    },
    // free-form name/value attributes shown under "Pet details"
    customDetails: {
      type: [{ name: { type: String, required: true, trim: true, maxlength: 80 }, value: { type: String, required: true, trim: true, maxlength: 500 } }],
      default: [],
    },

    dateOfBirth: Date,
    age: { value: { type: Number, min: 0, max: 600 }, unit: { type: String, enum: ["days", "weeks", "months", "years"] } },
    gender: { type: String, enum: ["male", "female"] },
    color: { type: String, maxlength: 60 },
    weightKg: { type: Number, min: 0, max: 200 },

    vaccination: {
      status: { type: String, enum: ["unknown", "none", "partial", "complete"], default: "unknown" },
      records: { type: [vaccinationRecord], default: [] }, // PRIVATE
    },
    health: {
      internalNotes: { type: String, maxlength: 5000 }, // PRIVATE
      publicDisclosure: { type: String, maxlength: 2000 }, // approved, customer-facing
    },
    microchipId: { type: String, trim: true, maxlength: 40 }, // PRIVATE
    documents: {
      // PRIVATE metadata only (binaries live in cloud storage)
      type: [{ name: { type: String, required: true, maxlength: 160 }, storageKey: { type: String, required: true, maxlength: 512 }, docType: { type: String, maxlength: 60 }, uploadedAt: { type: Date, default: Date.now } }],
      default: [],
    },
    media: { type: [mediaSchema], default: [] },

    price: { type: Number, required: true, min: 0, validate: Number.isInteger },
    discountType: { type: String, enum: DISCOUNT_TYPES, default: "none" },
    discountValue: { type: Number, default: 0, min: 0 },
    finalPrice: { type: Number, min: 0 }, // server-calculated in pre-validate
    currency: { type: String, default: "INR", uppercase: true, minlength: 3, maxlength: 3 },
    hsnCode: { type: String, trim: true, maxlength: 8 },
    taxCategory: { type: String, default: "standard", maxlength: 40 },
    taxRateBps: { type: Number, default: 0, min: 0, max: 10000 },

    availabilityStatus: { type: String, enum: AVAILABILITY, default: "available" },
    reservation: {
      customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
      orderId: { type: Schema.Types.ObjectId, ref: "Order" },
      reservedAt: Date,
      expiresAt: Date,
    },
    soldAt: Date,
    soldOrderId: { type: Schema.Types.ObjectId, ref: "Order" },

    status: { type: String, enum: PUBLICATION_STATUS, default: "draft" },
    isVisible: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    publishedAt: Date,
    careInfo: { type: String, maxlength: 3000 },
    ratingSummary: { type: ratingSummarySchema, default: () => ({ count: 0, sum: 0 }) },
    createdBy: Schema.Types.ObjectId,
    updatedBy: Schema.Types.ObjectId,
  },
  { timestamps: true },
);

petSchema.pre("validate", function (next) {
  try {
    this.finalPrice = calcFinalPrice(this.price, this.discountType as "none" | "percent" | "fixed", this.discountValue ?? 0);
  } catch (e) {
    this.invalidate("discountValue", (e as Error).message);
  }
  if (this.status === "published") {
    if (!this.description || this.description.trim().length < 20) this.invalidate("description", "Published pets need a description (min 20 chars)");
    if (!(this.price > 0)) this.invalidate("price", "Published pets need a price greater than zero");
    const images = (this.media ?? []).filter((m) => m.kind === "image");
    if (images.length < 1) this.invalidate("media", "Published pets need at least one image");
    else if (!images.some((m) => m.isPrimary)) this.invalidate("media", "Published pets need a primary image");
  }
  next();
});

petSchema.index({ name: "text", breed: "text", description: "text" }, { name: "pet_text", weights: { name: 10, breed: 5, description: 1 } }); // public search
petSchema.index({ slug: 1 }, { unique: true });
petSchema.index({ petCode: 1 }, { unique: true });
petSchema.index({ microchipId: 1 }, { unique: true, partialFilterExpression: { microchipId: { $type: "string" } } }); // optional unique
petSchema.index({ status: 1, isVisible: 1, availabilityStatus: 1, type: 1, categoryId: 1, finalPrice: 1 }); // public listing
petSchema.index({ categoryId: 1 }); // dependency checks on category archive/delete
petSchema.index({ isFeatured: 1, status: 1, createdAt: -1 });
petSchema.index({ "reservation.expiresAt": 1 }, { partialFilterExpression: { availabilityStatus: "reserved" } }); // expiry sweeps
petSchema.index({ soldOrderId: 1 }, { sparse: true });

export type PetDoc = InferSchemaType<typeof petSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const Pet: Model<PetDoc> = (models.Pet as Model<PetDoc>) || model<PetDoc>("Pet", petSchema, "pets");
