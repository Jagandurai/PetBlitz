import { Schema, model, models, Model, InferSchemaType, Types } from "mongoose";

export const ADMIN_ROLES = ["owner", "catalog", "orders", "finance", "support"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const adminUserSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true }, // scrypt$N$r$p$salt$hash
    role: { type: String, enum: ADMIN_ROLES, required: true },
    isActive: { type: Boolean, default: true },
    isPrimary: { type: Boolean, default: false }, // primary owner: cannot be deactivated/demoted; Google sign-in works for DB admins only
    mfa: {
      enabled: { type: Boolean, default: false },
      secretEnc: String, // AES-256-GCM encrypted TOTP secret
      pendingSecretEnc: String, // set during setup, promoted on first valid code
      recoveryHashes: { type: [String], default: [] }, // sha256 of single-use recovery codes
    },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: Date,
    lastLoginAt: Date,
    passwordChangedAt: Date,
    createdBy: String,
  },
  { timestamps: true },
);
adminUserSchema.index({ email: 1 }, { unique: true });

/** Server-side sessions so they can be revoked (logout, role change, password change). Only the SHA-256 of the token is stored. */
const adminSessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    adminId: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
    expiresAt: { type: Date, required: true }, // absolute lifetime (TTL-cleaned by MongoDB)
    lastSeenAt: { type: Date, default: Date.now }, // idle timeout
    ip: String,
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
adminSessionSchema.index({ tokenHash: 1 }, { unique: true });
adminSessionSchema.index({ adminId: 1 });
adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Append-only audit trail of every admin write (and denied/failed attempts). Request bodies are NOT stored (privacy). */
const auditLogSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    actorType: { type: String, enum: ["admin", "api-key", "anonymous"], required: true },
    actorId: String,
    actorEmail: String,
    role: String,
    action: { type: String, required: true, maxlength: 200 }, // "POST /api/admin/orders/:id/refund"
    path: { type: String, maxlength: 300 },
    targetId: String,
    status: Number,
    ip: String,
    userAgent: { type: String, maxlength: 300 },
  },
  { versionKey: false },
);
auditLogSchema.index({ at: -1 });
auditLogSchema.index({ actorId: 1, at: -1 });
auditLogSchema.index({ targetId: 1, at: -1 }, { sparse: true });

export type AdminUserDoc = InferSchemaType<typeof adminUserSchema> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
export type AdminSessionDoc = InferSchemaType<typeof adminSessionSchema> & { _id: Types.ObjectId };
export const AdminUser: Model<AdminUserDoc> = (models.AdminUser as Model<AdminUserDoc>) || model<AdminUserDoc>("AdminUser", adminUserSchema, "admin_users");
export const AdminSession: Model<AdminSessionDoc> = (models.AdminSession as Model<AdminSessionDoc>) || model<AdminSessionDoc>("AdminSession", adminSessionSchema, "admin_sessions");
export const AuditLog = (models.AuditLog as Model<InferSchemaType<typeof auditLogSchema>>) || model("AuditLog", auditLogSchema, "admin_audit_logs");
