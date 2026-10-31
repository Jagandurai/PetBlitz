import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";

export const MAX_MESSAGES_PER_TICKET = 200;

const attachmentSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 200 },
    url: { type: String, maxlength: 2048 },
    storageKey: { type: String, required: true, maxlength: 512 },
    mimeType: { type: String, maxlength: 100 },
    sizeBytes: { type: Number, min: 0, max: 10 * 1024 * 1024 },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    ticketNumber: { type: String, required: true, maxlength: 20 },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    guest: { name: { type: String, maxlength: 120 }, email: { type: String, lowercase: true, maxlength: 254 }, phone: { type: String, maxlength: 20 } },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    subject: { type: String, required: true, maxlength: 200 },
    category: { type: String, enum: ["general", "payment", "delivery", "return", "refund", "product", "pet", "other"], default: "general" },
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },
    status: { type: String, enum: ["open", "pending", "resolved", "closed"], default: "open" },
    thread: {
      type: [
        {
          senderType: { type: String, enum: ["customer", "guest", "admin"], required: true },
          senderId: String,
          body: { type: String, required: true, maxlength: 5000 },
          attachments: { type: [attachmentSchema], default: [], validate: [(v: unknown[]) => v.length <= 5, "max 5 attachments"] },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
      _id: false,
    },
    messageCount: { type: Number, default: 0, min: 0, max: MAX_MESSAGES_PER_TICKET }, // bounds document growth
    assignedTo: Schema.Types.ObjectId,
    lastMessageAt: Date,
    resolvedAt: Date,
  },
  { timestamps: true },
);

messageSchema.pre("validate", function (next) {
  if (!this.customerId && !this.guest?.email) this.invalidate("guest.email", "customerId or guest email required");
  next();
});

messageSchema.index({ ticketNumber: 1 }, { unique: true });
messageSchema.index({ customerId: 1, lastMessageAt: -1 }, { sparse: true });
messageSchema.index({ status: 1, priority: 1, lastMessageAt: -1 }); // admin inbox
messageSchema.index({ assignedTo: 1, status: 1 }, { sparse: true });
messageSchema.index({ orderId: 1 }, { sparse: true });

export type MessageDoc = InferSchemaType<typeof messageSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export const Message: Model<MessageDoc> = (models.Message as Model<MessageDoc>) || model<MessageDoc>("Message", messageSchema, "messages");
