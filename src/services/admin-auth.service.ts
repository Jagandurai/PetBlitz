import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { hashPassword, verifyPassword, DUMMY_HASH, passwordProblem } from "@/lib/auth/password";
import { decryptSecret, encryptSecret, generateTotpSecret, hashRecovery, newRecoveryCodes, otpauthUrl, verifyTotp } from "@/lib/auth/totp";
import { getEnv } from "@/lib/env";
import { AppError, conflict, isDuplicateKeyError, notFound } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { AdminRole, AdminSession, AdminUser, AdminUserDoc } from "@/models/Admin";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const MAX_FAILS = 5, LOCK_MIN = 15;

export const toAdminProfile = (a: Pick<AdminUserDoc, "_id" | "email" | "name" | "role" | "isActive" | "mfa" | "lastLoginAt"> & { isPrimary?: boolean }) => ({ id: String(a._id), email: a.email, name: a.name, role: a.role, isActive: a.isActive, isPrimary: !!a.isPrimary, mfaEnabled: !!a.mfa?.enabled, lastLoginAt: a.lastLoginAt });

export interface AdminPrincipalLite { id: string; objectId: string; email: string; role: AdminRole; mfaEnabled: boolean }

export async function createAdmin(i: { email: string; name: string; role: AdminRole; password: string }, createdBy?: string) {
  await connectDB();
  const email = i.email.trim().toLowerCase();
  const problem = passwordProblem(i.password, email);
  if (problem) throw new AppError("WEAK_PASSWORD", 422, problem);
  try {
    const a = await AdminUser.create({ email, name: i.name.trim(), role: i.role, passwordHash: hashPassword(i.password), passwordChangedAt: new Date(), createdBy });
    return toAdminProfile(a.toObject());
  } catch (e) {
    if (isDuplicateKeyError(e)) throw conflict("ADMIN_EXISTS", "An admin with this e-mail already exists");
    throw e;
  }
}

/** Password (+ TOTP or recovery code when MFA is on). Generic error text for every failure; 5 failures lock the account for 15 min. */
export async function loginAdmin(i: { email: string; password: string; totp?: string; recoveryCode?: string }, ctx: { ip?: string; userAgent?: string }) {
  await connectDB();
  const env = getEnv();
  const email = i.email.trim().toLowerCase();
  const a = await AdminUser.findOne({ email });
  const fail = () => new AppError("INVALID_CREDENTIALS", 401, "Invalid e-mail, password or code");
  if (a?.lockedUntil && a.lockedUntil > new Date()) throw new AppError("ACCOUNT_LOCKED", 423, "Too many failed attempts. Try again later.");
  const passwordOk = verifyPassword(i.password, a?.passwordHash ?? DUMMY_HASH); // always hashes: constant-ish timing
  if (!a || !a.isActive || !passwordOk) {
    if (a) {
      const locked = a.failedLogins + 1 >= MAX_FAILS;
      await AdminUser.updateOne({ _id: a._id }, { $inc: { failedLogins: 1 }, ...(locked ? { $set: { lockedUntil: new Date(Date.now() + LOCK_MIN * 60_000), failedLogins: 0 } } : {}) });
    }
    throw fail();
  }
  if (a.mfa?.enabled) {
    let ok = false;
    if (i.totp && a.mfa.secretEnc) ok = verifyTotp(decryptSecret(a.mfa.secretEnc), i.totp);
    else if (i.recoveryCode) {
      const h = hashRecovery(i.recoveryCode);
      const used = await AdminUser.updateOne({ _id: a._id, "mfa.recoveryHashes": h }, { $pull: { "mfa.recoveryHashes": h } }); // single use, atomic
      ok = used.modifiedCount === 1;
    } else throw new AppError("MFA_REQUIRED", 401, "Enter your authenticator code");
    if (!ok) { await AdminUser.updateOne({ _id: a._id }, { $inc: { failedLogins: 1 } }); throw fail(); }
  }
  return startAdminSession(a, ctx);
}

async function startAdminSession(a: AdminUserDoc & { toObject(): AdminUserDoc }, ctx: { ip?: string; userAgent?: string }) {
  await AdminUser.updateOne({ _id: a._id }, { $set: { failedLogins: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: 1 } });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + getEnv().ADMIN_SESSION_HOURS * 3600_000);
  await AdminSession.create({ tokenHash: sha(token), adminId: a._id, expiresAt, ip: ctx.ip, userAgent: ctx.userAgent?.slice(0, 300) });
  return { token, expiresAt, admin: toAdminProfile({ ...a.toObject(), lastLoginAt: new Date() }) };
}

/**
 * Google sign-in for admins. The e-mail must be verified by Google and either match an active admin record
 * be stored in the database (the primary admin is flagged isPrimary); there is no e-mail allow-list in the environment.
 */
export async function loginAdminWithGoogle(profile: { email: string; email_verified: boolean }, ctx: { ip?: string; userAgent?: string }) {
  await connectDB();
  const email = profile.email.trim().toLowerCase();
  const denied = () => new AppError("FORBIDDEN", 403, "This Google account is not authorised for the admin portal");
  if (!profile.email_verified) throw denied();
  let a = await AdminUser.findOne({ email });
  if (!a || !a.isActive) throw denied(); // only admins stored in the database may sign in with Google
  if (a.lockedUntil && a.lockedUntil > new Date()) throw new AppError("ACCOUNT_LOCKED", 423, "Too many failed attempts. Try again later.");
  return startAdminSession(a as never, ctx);
}

/** Resolves a session cookie to an admin. Enforces absolute expiry + idle timeout; touches lastSeenAt at most once a minute. */
export async function authenticateSession(token: string): Promise<AdminPrincipalLite | null> {
  await connectDB();
  const s = await AdminSession.findOne({ tokenHash: sha(token) }).lean();
  if (!s) return null;
  const idleMs = getEnv().ADMIN_IDLE_MINUTES * 60_000;
  if (s.expiresAt <= new Date() || Date.now() - s.lastSeenAt.getTime() > idleMs) { await AdminSession.deleteOne({ _id: s._id }); return null; }
  const a = await AdminUser.findById(s.adminId).lean();
  if (!a || !a.isActive) return null;
  if (Date.now() - s.lastSeenAt.getTime() > 60_000) await AdminSession.updateOne({ _id: s._id }, { $set: { lastSeenAt: new Date() } });
  return { id: String(a._id), objectId: String(a._id), email: a.email, role: a.role, mfaEnabled: !!a.mfa?.enabled };
}

export async function logoutSession(token: string) { await connectDB(); await AdminSession.deleteOne({ tokenHash: sha(token) }); }
export async function revokeSessions(adminId: string | Types.ObjectId, exceptToken?: string) {
  await connectDB();
  await AdminSession.deleteMany({ adminId: toObjectId(adminId), ...(exceptToken ? { tokenHash: { $ne: sha(exceptToken) } } : {}) });
}

export async function changePassword(adminId: string, current: string, next: string, keepToken?: string) {
  await connectDB();
  const a = await AdminUser.findById(toObjectId(adminId));
  if (!a || !verifyPassword(current, a.passwordHash)) throw new AppError("INVALID_CREDENTIALS", 401, "Current password is incorrect");
  const problem = passwordProblem(next, a.email);
  if (problem) throw new AppError("WEAK_PASSWORD", 422, problem);
  a.passwordHash = hashPassword(next); a.passwordChangedAt = new Date();
  await a.save();
  await revokeSessions(a._id, keepToken); // every other device is signed out
}

export async function beginMfaSetup(adminId: string) {
  await connectDB();
  const a = await AdminUser.findById(toObjectId(adminId));
  if (!a) throw notFound("Admin");
  if (a.mfa?.enabled) throw conflict("MFA_ALREADY_ENABLED", "MFA is already enabled");
  const secret = generateTotpSecret();
  await AdminUser.updateOne({ _id: a._id }, { $set: { "mfa.pendingSecretEnc": encryptSecret(secret) } });
  return { secret, otpauthUrl: otpauthUrl(a.email, secret) }; // shown once; the QR is rendered client-side
}

export async function enableMfa(adminId: string, code: string) {
  await connectDB();
  const a = await AdminUser.findById(toObjectId(adminId));
  if (!a?.mfa?.pendingSecretEnc) throw conflict("MFA_NOT_STARTED", "Start MFA setup first");
  if (!verifyTotp(decryptSecret(a.mfa.pendingSecretEnc), code)) throw new AppError("INVALID_CODE", 401, "That code is not valid");
  const codes = newRecoveryCodes();
  await AdminUser.updateOne({ _id: a._id }, { $set: { "mfa.enabled": true, "mfa.secretEnc": a.mfa.pendingSecretEnc, "mfa.recoveryHashes": codes.map(hashRecovery) }, $unset: { "mfa.pendingSecretEnc": 1 } });
  return { recoveryCodes: codes }; // shown once
}

export async function disableMfa(adminId: string, password: string, code: string) {
  await connectDB();
  const a = await AdminUser.findById(toObjectId(adminId));
  if (!a?.mfa?.enabled || !a.mfa.secretEnc) throw conflict("MFA_NOT_ENABLED", "MFA is not enabled");
  if (!verifyPassword(password, a.passwordHash) || !verifyTotp(decryptSecret(a.mfa.secretEnc), code)) throw new AppError("INVALID_CREDENTIALS", 401, "Invalid password or code");
  await AdminUser.updateOne({ _id: a._id }, { $set: { "mfa.enabled": false, "mfa.recoveryHashes": [] }, $unset: { "mfa.secretEnc": 1, "mfa.pendingSecretEnc": 1 } });
}

// ---------------------------------------------------------------- owner management
export async function listAdmins() {
  await connectDB();
  return (await AdminUser.find({}, { passwordHash: 0, "mfa.secretEnc": 0, "mfa.pendingSecretEnc": 0, "mfa.recoveryHashes": 0 }).sort({ createdAt: 1 }).lean()).map((a) => toAdminProfile(a));
}

export async function updateAdmin(id: string, patch: { name?: string; role?: AdminRole; isActive?: boolean }, actorId: string) {
  await connectDB();
  const oid = toObjectId(id);
  const target = await AdminUser.findById(oid);
  if (!target) throw notFound("Admin");
  if (target.isPrimary && ((patch.role && patch.role !== "owner") || patch.isActive === false)) throw conflict("PRIMARY_ADMIN", "The primary admin cannot be deactivated or demoted");
  const losesOwner = target.role === "owner" && ((patch.role && patch.role !== "owner") || patch.isActive === false);
  if (losesOwner && (await AdminUser.countDocuments({ role: "owner", isActive: true, _id: { $ne: oid } })) === 0) throw conflict("LAST_OWNER", "At least one active owner is required");
  if (String(oid) === actorId && patch.isActive === false) throw conflict("SELF_DEACTIVATE", "You cannot deactivate yourself");
  Object.assign(target, patch);
  await target.save();
  if (patch.role || patch.isActive === false) await revokeSessions(oid); // privilege changes take effect immediately
  return toAdminProfile(target.toObject());
}

export async function resetAdminPassword(id: string, password: string) {
  await connectDB();
  const a = await AdminUser.findById(toObjectId(id));
  if (!a) throw notFound("Admin");
  const problem = passwordProblem(password, a.email);
  if (problem) throw new AppError("WEAK_PASSWORD", 422, problem);
  a.passwordHash = hashPassword(password); a.passwordChangedAt = new Date(); a.failedLogins = 0; a.lockedUntil = undefined;
  await a.save();
  await revokeSessions(a._id);
}
