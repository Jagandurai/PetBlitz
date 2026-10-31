import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";

export const WALLET_REASONS = ["refund", "order_payment", "order_payment_reversal", "admin_adjustment", "topup"] as const;

/**
 * Immutable wallet LEDGER (append-only). Customer.walletBalance is the running balance; this collection is the audit trail.
 * Added as a 9th collection because a balance without a ledger cannot be audited or reconciled.
 * `idempotencyKey` is unique, so retries / duplicate webhooks can never credit or debit twice.
 */
const walletTxSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    type: { type: String, enum: ["credit", "debit"], required: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger }, // paise, always positive
    balanceAfter: { type: Number, default: 0, min: 0 },
    reason: { type: String, enum: WALLET_REASONS, required: true },
    description: { type: String, maxlength: 300 },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    refundId: { type: Schema.Types.ObjectId },
    idempotencyKey: { type: String, required: true, maxlength: 120 },
    createdBy: { type: String, maxlength: 60 }, // admin id for manual adjustments
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

walletTxSchema.index({ idempotencyKey: 1 }, { unique: true });
walletTxSchema.index({ customerId: 1, createdAt: -1 }); // statement view
walletTxSchema.index({ orderId: 1 }, { sparse: true });

export type WalletTxDoc = InferSchemaType<typeof walletTxSchema> & { _id: Types.ObjectId; createdAt: Date };
export const WalletTransaction: Model<WalletTxDoc> = (models.WalletTransaction as Model<WalletTxDoc>) || model<WalletTxDoc>("WalletTransaction", walletTxSchema, "wallet_transactions");
