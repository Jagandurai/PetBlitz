import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";

/** Progress stages (see lib/order-status.ts), exceptional states, then legacy values kept so old orders stay readable and saveable. */
export const ORDER_STATUSES = ["placed", "accepted", "packed", "dispatched", "in_transit", "delivered", "cancelled", "refund_initiated", "refunded", "confirmed", "processing", "shipped", "out_for_delivery"] as const;
export const PAYMENT_STATUSES = ["pending", "paid", "failed", "partially_refunded", "refunded"] as const;
export const FULFILLMENT_STATUSES = ["unfulfilled", "packed", "shipped", "delivered", "returned"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const minor = { type: Number, required: true, min: 0, validate: Number.isInteger }; // integer minor units (paise)

const itemSchema = new Schema(
  {
    // "pet", petId and petCode are LEGACY: retained so historical orders stay readable and saveable. Never written for new orders.
    itemType: { type: String, enum: ["pet", "product"], required: true },
    petId: { type: Schema.Types.ObjectId },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    // ---- immutable snapshots ----
    name: { type: String, required: true, maxlength: 200 },
    sku: { type: String, maxlength: 60 },
    petCode: { type: String, maxlength: 30 },
    slug: { type: String, maxlength: 200 },
    hsnCode: { type: String, maxlength: 8 },
    imageUrl: { type: String, maxlength: 2048 },
    category: { categoryId: Schema.Types.ObjectId, name: String, slug: String },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    unitPrice: minor, // list price per unit
    unitDiscount: minor, // discount per unit
    discountAmount: minor, // unitDiscount * quantity
    taxRateBps: { type: Number, required: true, min: 0 },
    taxAmount: minor,
    subtotal: minor, // unitPrice * quantity
    lineTotal: minor, // subtotal - discountAmount + taxAmount
    inventoryState: { type: String, enum: ["reserved", "committed", "released"], default: "reserved" },
  },
  { _id: true }, // stable order-item id (reviews reference it)
);

itemSchema.pre("validate", function (next) {
  if (this.itemType === "product" && !this.productId) this.invalidate("productId", "product items need a productId");
  next();
});

const addressSnapshot = new Schema(
  { recipientName: String, phone: String, line1: String, line2: String, landmark: String, city: String, state: String, postalCode: String, countryCode: String, label: String },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, maxlength: 30 },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    idempotencyKey: { type: String, required: true, maxlength: 100 },
    items: { type: [itemSchema], validate: [(v: unknown[]) => v.length >= 1 && v.length <= 50, "1-50 items"] },
    currency: { type: String, default: "INR", uppercase: true, minlength: 3, maxlength: 3 },
    subtotal: minor,
    discountTotal: minor,
    shippingTotal: minor,
    taxTotal: minor,
    grandTotal: minor,
    amountPaid: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    amountRefunded: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    customerSnapshot: { name: String, email: String, phone: String },
    shippingAddress: { type: addressSnapshot, required: true },
    billingAddress: { type: addressSnapshot, required: true },
    status: { type: String, enum: ORDER_STATUSES, default: "placed" },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "pending" },
    fulfillmentStatus: { type: String, enum: FULFILLMENT_STATUSES, default: "unfulfilled" },
    statusHistory: {
      type: [
        {
          from: String,
          to: { type: String, required: true },
          at: { type: Date, default: Date.now },
          actorType: { type: String, enum: ["customer", "admin", "system"], required: true },
          actorId: String,
          actorName: { type: String, maxlength: 254 }, // admin who made the change; PRIVATE - never returned to customers
          note: { type: String, maxlength: 500 },
        },
      ],
      default: [],
    },
    shipping: {
      partner: { type: String, maxlength: 80 },
      trackingNumber: { type: String, maxlength: 80 },
      trackingUrl: { type: String, maxlength: 2048 },
      shippedAt: Date,
      estimatedDelivery: Date,
      deliveredAt: Date,
      notes: { type: String, maxlength: 1000 }, // PRIVATE
      customerRemarks: { type: String, maxlength: 500 },
    },
    customerNote: { type: String, maxlength: 1000 },
    adminNote: { type: String, maxlength: 2000 }, // PRIVATE - never returned to customers
    cancellation: { reason: { type: String, maxlength: 500 }, cancelledAt: Date, cancelledByType: String },
    refundSummary: { totalRefunded: { type: Number, default: 0 }, lastRefundAt: Date },
    paidAt: Date,
    // unread markers for the notification badges: set when the other side does something, cleared when the record is opened
    adminUnread: { type: Boolean, default: false },
    customerUnread: { type: Boolean, default: false },
    archivedAt: Date, // hidden from the active admin list; reversible
    couponCode: { type: String, maxlength: 40 },
    couponDiscount: { type: Number, default: 0, min: 0 }, // already included in discountTotal
    pricesIncludeTax: { type: Boolean, default: false }, // snapshot of the tax mode used for this order
    placeOfSupply: { type: String, maxlength: 2 }, // GST state code of the shipping address
    paidPaymentId: { type: Schema.Types.ObjectId, ref: "Payment" }, // the ONE payment that settled this order (duplicate payments are refunded)
  },
  { timestamps: true },
);

orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ adminUnread: 1 });
orderSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true }); // duplicate-checkout protection
orderSchema.index({ customerId: 1, createdAt: -1 }); // "my orders"
orderSchema.index({ status: 1, createdAt: -1 }); // admin queues
orderSchema.index({ paymentStatus: 1, status: 1, createdAt: 1 }); // expired-unpaid sweep
orderSchema.index({ "items.category.categoryId": 1 }); // category-delete safety check
orderSchema.index({ "items.petId": 1 }, { sparse: true });
orderSchema.index({ "items.productId": 1 }, { sparse: true });

export type OrderDoc = InferSchemaType<typeof orderSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const Order: Model<OrderDoc> = (models.Order as Model<OrderDoc>) || model<OrderDoc>("Order", orderSchema, "orders");
