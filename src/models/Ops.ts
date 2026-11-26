import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";

/** Transactional e-mail queue: services enqueue (never block or fail a request); the maintenance job sends with retries. */
const emailSchema = new Schema(
  {
    dedupeKey: { type: String, required: true, maxlength: 120 }, // e.g. "order-placed:<orderId>" => at most one mail per event
    to: { type: String, required: true, maxlength: 254 },
    template: { type: String, required: true, maxlength: 60 },
    subject: { type: String, required: true, maxlength: 300 },
    html: { type: String, required: true },
    text: { type: String, required: true },
    status: { type: String, enum: ["pending", "sending", "sent", "failed"], default: "pending" },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    lastError: { type: String, maxlength: 300 },
    sentAt: Date,
  },
  { timestamps: true },
);
emailSchema.index({ dedupeKey: 1 }, { unique: true });
emailSchema.index({ status: 1, nextAttemptAt: 1 });
emailSchema.index({ sentAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90, partialFilterExpression: { status: "sent" } }); // purge sent mail after 90 days

const money = { type: Number, required: true, min: 0 };
const invoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    customerId: { type: Schema.Types.ObjectId, required: true },
    fiscalYear: { type: String, required: true }, // "2026-27" (April-March)
    issuedAt: { type: Date, default: Date.now },
    seller: { legalName: String, gstin: String, address: String, stateCode: String },
    buyer: { name: String, email: String, gstin: String, address: String, stateCode: String },
    placeOfSupply: { type: String, required: true },
    pricesIncludeTax: Boolean,
    lines: [{ _id: false, description: String, hsnCode: String, quantity: Number, taxableValue: money, taxRateBps: Number, cgst: money, sgst: money, igst: money, total: money }],
    shipping: money,
    totals: { taxable: money, cgst: money, sgst: money, igst: money, grandTotal: money },
    currency: { type: String, default: "INR" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ orderId: 1 }, { unique: true }); // one invoice per order (idempotent issue)
invoiceSchema.index({ customerId: 1, issuedAt: -1 });

const returnSchema = new Schema(
  {
    returnNumber: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderItemId: { type: Schema.Types.ObjectId, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    reason: { type: String, enum: ["damaged", "wrong_item", "not_as_described", "no_longer_needed", "other"], required: true },
    details: { type: String, maxlength: 1000 },
    status: { type: String, enum: ["requested", "approved", "rejected", "received", "refunded", "closed"], default: "requested" },
    adminNote: { type: String, maxlength: 1000 },
    refundAmount: { type: Number, min: 0 },
    history: { type: [{ status: String, at: { type: Date, default: Date.now }, by: String, note: String }], default: [], _id: false },
  },
  { timestamps: true },
);
returnSchema.index({ returnNumber: 1 }, { unique: true });
returnSchema.index({ customerId: 1, createdAt: -1 });
returnSchema.index({ status: 1, createdAt: 1 });
returnSchema.index({ orderId: 1, orderItemId: 1 });

const movementSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    delta: { type: Number, required: true },
    stockAfter: { type: Number, required: true },
    reason: { type: String, enum: ["admin_adjust", "order_commit", "order_restock"], required: true },
    orderId: Schema.Types.ObjectId,
    actorId: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
movementSchema.index({ productId: 1, createdAt: -1 });

export type ReturnDoc = InferSchemaType<typeof returnSchema> & { _id: Types.ObjectId; createdAt: Date };
export type InvoiceDoc = InferSchemaType<typeof invoiceSchema> & { _id: Types.ObjectId };
export const EmailOutbox = (models.EmailOutbox as Model<InferSchemaType<typeof emailSchema>>) || model("EmailOutbox", emailSchema, "email_outbox");
export const Invoice: Model<InvoiceDoc> = (models.Invoice as Model<InvoiceDoc>) || model<InvoiceDoc>("Invoice", invoiceSchema, "invoices");
export const ReturnRequest: Model<ReturnDoc> = (models.ReturnRequest as Model<ReturnDoc>) || model<ReturnDoc>("ReturnRequest", returnSchema, "return_requests");
export const InventoryMovement = (models.InventoryMovement as Model<InferSchemaType<typeof movementSchema>>) || model("InventoryMovement", movementSchema, "inventory_movements");
