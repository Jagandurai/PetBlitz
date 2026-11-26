import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";

const minor = { type: Number, required: true, min: 0, validate: Number.isInteger };

const paymentSchema = new Schema(
  {
    paymentRef: { type: String, required: true, maxlength: 30 },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" }, // required when purpose = "order"
    purpose: { type: String, enum: ["order", "wallet_topup"], default: "order" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    provider: { type: String, enum: ["razorpay", "wallet"], default: "razorpay" },
    providerOrderId: { type: String, maxlength: 100 }, // Razorpay order_xxx
    providerPaymentId: { type: String, maxlength: 100 }, // Razorpay pay_xxx
    // Razorpay order-creation is coordinated by a database lease so multiple app instances cannot both create orders for the same pending order.
    claimToken: { type: String, maxlength: 100 },
    claimLeaseExpiresAt: Date,
    amount: minor,
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
    status: { type: String, enum: ["pending", "paid", "failed", "partially_refunded", "refunded"], default: "pending" },
    paymentMethodType: { type: String, maxlength: 40 }, // card / upi / netbanking / wallet ...
    failureCode: { type: String, maxlength: 100 },
    failureMessage: { type: String, maxlength: 300 }, // sanitized
    // Webhook idempotency: bounded to the most recent 50 events (written with $slice).
    processedEvents: { type: [{ eventId: { type: String, required: true }, type: { type: String }, processedAt: { type: Date, default: Date.now } }], default: [], _id: false },
    refunds: {
      type: [
        {
          refundId: { type: Schema.Types.ObjectId, required: true }, // our stable id (also used in the wallet idempotency key)
          destination: { type: String, enum: ["wallet", "original"], required: true },
          providerRefundId: { type: String, maxlength: 100 }, // Razorpay rfnd_xxx (destination = original)
          amount: minor,
          status: { type: String, enum: ["pending", "succeeded", "failed"], default: "pending" },
          reason: { type: String, maxlength: 300 },
          createdAt: { type: Date, default: Date.now },
          processedAt: Date,
        },
      ],
      default: [],
      _id: false,
    },
    amountRefunded: { type: Number, default: 0, min: 0, validate: Number.isInteger }, // pending + succeeded
    paidAt: Date,
    failedAt: Date,
    // Deliberately NO card numbers / CVV / secrets - Razorpay hosts the payment form.
  },
  { timestamps: true },
);

paymentSchema.pre("validate", function (next) {
  if (this.purpose === "order" && !this.orderId) this.invalidate("orderId", "orderId is required for order payments");
  next();
});

paymentSchema.index({ paymentRef: 1 }, { unique: true });
paymentSchema.index({ providerOrderId: 1 }, { unique: true, partialFilterExpression: { providerOrderId: { $type: "string" } } });
paymentSchema.index({ providerPaymentId: 1 }, { unique: true, partialFilterExpression: { providerPaymentId: { $type: "string" } } });
paymentSchema.index(
  { orderId: 1, provider: 1 },
  {
    unique: true,
    partialFilterExpression: {
      provider: "razorpay",
      status: "pending",
      orderId: { $type: "objectId" },
    },
  },
);
paymentSchema.index({ orderId: 1 }); // unchanged from Phase 1 (an existing Atlas index of the same spec must not conflict)
paymentSchema.index({ customerId: 1, createdAt: -1 });

export type PaymentDoc = InferSchemaType<typeof paymentSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const Payment: Model<PaymentDoc> = (models.Payment as Model<PaymentDoc>) || model<PaymentDoc>("Payment", paymentSchema, "payments");
