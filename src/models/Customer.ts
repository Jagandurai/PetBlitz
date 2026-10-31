import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";

const addressSchema = new Schema(
  {
    label: { type: String, maxlength: 40, default: "Home" },
    recipientName: { type: String, required: true, maxlength: 120 },
    phone: { type: String, required: true, maxlength: 20 },
    line1: { type: String, required: true, maxlength: 200 },
    line2: { type: String, maxlength: 200 },
    landmark: { type: String, maxlength: 120 },
    city: { type: String, required: true, maxlength: 80 },
    state: { type: String, required: true, maxlength: 80 },
    postalCode: { type: String, required: true, maxlength: 12 },
    countryCode: { type: String, required: true, default: "IN", uppercase: true, minlength: 2, maxlength: 2 },
  },
  { _id: true }, // stable addressId
);

const customerSchema = new Schema(
  {
    googleId: { type: String, required: true, trim: true, maxlength: 100 }, // Google "sub" claim = provider identity
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    emailVerified: { type: Boolean, default: false },
    firstName: { type: String, trim: true, maxlength: 80 },
    lastName: { type: String, trim: true, maxlength: 80 },
    displayName: { type: String, trim: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 20 },
    phoneVerified: { type: Boolean, default: false },
    avatarUrl: { type: String, maxlength: 2048 },
    preferences: { newsletter: { type: Boolean, default: false }, preferredPetType: { type: String, enum: ["dog", "cat", "both"] } },
    marketingConsent: { granted: { type: Boolean, default: false }, grantedAt: Date },
    addresses: { type: [addressSchema], default: [], validate: [(v: unknown[]) => v.length <= 10, "max 10 addresses"] },
    defaultShippingAddressId: Schema.Types.ObjectId,
    defaultBillingAddressId: Schema.Types.ObjectId,
    // Wallet balance in INR paise. Changed ONLY by wallet.service (atomic, ledgered); never by customer input.
    walletBalance: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    status: { type: String, enum: ["active", "suspended", "deleted"], default: "active" },
    lastLoginAt: Date,
    deletedAt: Date,
    // Deliberately NO password, OAuth tokens or role fields: Google-only auth, and customers have no admin permissions.
  },
  { timestamps: true },
);

customerSchema.index({ googleId: 1 }, { unique: true });
customerSchema.index({ email: 1 }, { unique: true });
customerSchema.index({ status: 1, createdAt: -1 });

export type CustomerDoc = InferSchemaType<typeof customerSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const Customer: Model<CustomerDoc> = (models.Customer as Model<CustomerDoc>) || model<CustomerDoc>("Customer", customerSchema, "customers");
