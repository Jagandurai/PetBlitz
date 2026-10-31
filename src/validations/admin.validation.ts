import { z } from "zod";
import { objectId, pagination } from "./common";
import { moderateReviewSchema } from "./review.validation";
import { replySchema } from "./message.validation";
import { refundSchema } from "./payment.validation";

// ---- categories
export const moveCategorySchema = z.object({ parentId: objectId.nullable(), position: z.number().int().min(0).max(100000).optional() }).strict();
export const reorderCategoriesSchema = z.object({ parentId: objectId.nullable(), orderedIds: z.array(objectId).min(1).max(200) }).strict();
export const visibilitySchema = z.object({ isVisible: z.boolean() }).strict();
export const activeSchema = z.object({ isActive: z.boolean() }).strict();
export const archiveCategorySchema = z.object({ archiveDescendants: z.boolean().optional(), reassignDependentsTo: objectId.optional() }).strict();
export const restoreCategorySchema = z.object({ restoreDescendants: z.boolean().optional() }).strict();
export const adminCategoryQuery = z.object({ flat: z.enum(["true", "false"]).optional(), includeArchived: z.enum(["true", "false"]).optional(), parentId: z.union([objectId, z.literal("root")]).optional() }).strict();

// ---- pets / products
export const publicationSchema = z.object({ status: z.enum(["published", "draft", "archived"]) }).strict();
export const petAvailabilitySchema = z.object({ status: z.enum(["available", "unavailable"]) }).strict();
export const stockSchema = z.object({ mode: z.enum(["set", "adjust"]), value: z.number().int().min(-1_000_000).max(1_000_000) }).strict();
export const adminPetQuery = pagination.extend({
  status: z.enum(["draft", "published", "archived"]).optional(),
  availability: z.enum(["available", "reserved", "sold", "unavailable"]).optional(),
  type: z.enum(["dog", "cat"]).optional(),
  categoryId: objectId.optional(),
  q: z.string().trim().min(1).max(100).optional(),
}).strict();
export const adminProductQuery = pagination.extend({
  status: z.enum(["draft", "published", "archived"]).optional(),
  categoryId: objectId.optional(),
  lowStock: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  q: z.string().trim().min(1).max(100).optional(),
}).strict();

// ---- orders
const ORDER_STATUS_NO_CANCEL = ["accepted", "confirmed", "processing", "shipped", "in_transit", "out_for_delivery", "delivered", "refund_initiated", "refunded"] as const;
export const orderStatusSchema = z.object({ status: z.enum(ORDER_STATUS_NO_CANCEL), note: z.string().max(500).optional() }).strict(); // cancelling has its own endpoint (it refunds and releases stock)
export const orderCancelSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();
export const orderNoteSchema = z.object({ adminNote: z.string().max(2000) }).strict();
export const orderRefundSchema = refundSchema.omit({ paymentId: true }).extend({ amount: z.number().int().min(1).optional() }).strict();
export const adminOrderQuery = pagination.extend({
  status: z.enum(["placed", "accepted", "confirmed", "processing", "shipped", "in_transit", "out_for_delivery", "delivered", "cancelled", "refund_initiated", "refunded"]).optional(),
  paymentStatus: z.enum(["pending", "paid", "failed", "partially_refunded", "refunded"]).optional(),
  customerId: objectId.optional(),
  q: z.string().trim().min(3).max(30).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict();

// ---- customers / wallet
export const customerStatusSchema = z.object({ status: z.enum(["active", "suspended"]) }).strict();
export const adminCustomerQuery = pagination.extend({ q: z.string().trim().email().optional(), status: z.enum(["active", "suspended", "deleted"]).optional() }).strict();
export const adminWalletAdjustSchema = z.object({ direction: z.enum(["credit", "debit"]), amount: z.number().int().min(1).max(100_000_00), reason: z.string().trim().min(3).max(300), idempotencyKey: z.string().min(8).max(100) }).strict();
export const reconcileSchema = z.object({ fix: z.boolean().optional() }).strict();
export const statementQuery = pagination.strict();

// ---- reviews / tickets
export { moderateReviewSchema, replySchema };
export const adminReviewQuery = pagination.extend({ status: z.enum(["pending", "approved", "rejected", "hidden"]).optional() }).strict();
export const adminTicketQuery = pagination.extend({ status: z.enum(["open", "pending", "resolved", "closed"]).optional() }).strict();
export const ticketStatusSchema = z.object({ status: z.enum(["open", "pending", "resolved", "closed"]) }).strict();
export const ticketThreadQuery = z.object({ threadPage: z.coerce.number().int().min(1).max(1000).default(1) }).strict();

// ---- media
export const mediaSignSchema = z.object({ folder: z.enum(["pets", "products", "categories", "reviews"]) }).strict();

// ---- customer-facing
export const googleLoginSchema = z.object({ idToken: z.string().min(20).max(4096) }).strict();
export const topupSchema = z.object({ amount: z.number().int().min(1) }).strict();
export const defaultAddressSchema = z.object({ shipping: z.boolean().optional(), billing: z.boolean().optional() }).strict();
export const customerCancelSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();
export const pageQuery = pagination.strict();

// ---- admin accounts / auth
const roleEnum = z.enum(["owner", "catalog", "orders", "finance", "support"]);
export const adminLoginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128), totp: z.string().regex(/^\d{6}$/).optional(), recoveryCode: z.string().min(5).max(20).optional() }).strict();
export const adminPasswordSchema = z.object({ current: z.string().min(1).max(128), next: z.string().min(12).max(128) }).strict();
export const mfaEnableSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
export const mfaDisableSchema = z.object({ password: z.string().min(1).max(128), code: z.string().regex(/^\d{6}$/) }).strict();
export const createAdminSchema = z.object({ email: z.string().email().max(254), name: z.string().trim().min(2).max(120), role: roleEnum, password: z.string().min(12).max(128) }).strict();
export const updateAdminSchema = z.object({ name: z.string().trim().min(2).max(120), role: roleEnum, isActive: z.boolean() }).partial().strict();
export const resetAdminPasswordSchema = z.object({ password: z.string().min(12).max(128) }).strict();
export const auditQuery = pagination.extend({ actorId: z.string().max(40).optional(), method: z.enum(["POST", "PATCH", "PUT", "DELETE"]).optional() }).strict();
