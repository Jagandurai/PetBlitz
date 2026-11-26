import { connectDB } from "@/lib/db/connection";
import { AppError, conflict, isDuplicateKeyError, notFound } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { Customer, CustomerDoc } from "@/models/Customer";
import { AddressInput, CustomerSelfUpdate, GoogleProfile, addressSchema, customerSelfUpdateSchema, googleProfileSchema } from "@/validations/customer.validation";

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** Private-profile projection returned to the OWNER only. Never includes googleId/internal flags. */
export function toCustomerProfile(c: CustomerDoc) {
  return {
    id: String(c._id), email: c.email, emailVerified: c.emailVerified, firstName: c.firstName, lastName: c.lastName, displayName: c.displayName, phone: c.phone,
    phoneVerified: c.phoneVerified, wallet: { balance: c.walletBalance ?? 0, currency: "INR" }, avatarUrl: c.avatarUrl, preferences: c.preferences, marketingConsent: c.marketingConsent,
    addresses: (c.addresses ?? []).map((a) => ({ id: String(a._id), ...JSON.parse(JSON.stringify(a)) })),
    defaultShippingAddressId: c.defaultShippingAddressId ? String(c.defaultShippingAddressId) : undefined,
    defaultBillingAddressId: c.defaultBillingAddressId ? String(c.defaultBillingAddressId) : undefined,
  };
}

/**
 * Called by the auth layer AFTER Google has verified the ID token (verification is the auth layer's job).
 * Identity = Google `sub`. Email is only a contact attribute:
 *  - unverified Google emails are rejected;
 *  - if the email already belongs to a DIFFERENT Google identity we refuse to auto-link (account-takeover guard).
 */
export async function upsertCustomerFromGoogle(profile: GoogleProfile) {
  await connectDB();
  const p = googleProfileSchema.parse(profile);
  if (!p.email_verified) throw new AppError("EMAIL_NOT_VERIFIED", 403, "Google email must be verified");
  const email = normalizeEmail(p.email);
  const now = new Date();

  const existing = await Customer.findOne({ googleId: p.sub });
  if (existing) {
    if (existing.status === "suspended") throw new AppError("ACCOUNT_SUSPENDED", 403, "Account suspended");
    if (existing.status === "deleted") throw new AppError("ACCOUNT_DELETED", 403, "Account deleted");
    if (existing.email !== email) {
      if (await Customer.exists({ email, _id: { $ne: existing._id } })) throw conflict("ACCOUNT_LINK_CONFLICT", "That email belongs to another account");
      existing.email = email;
    }
    existing.emailVerified = true;
    existing.lastLoginAt = now;
    if (p.picture) existing.avatarUrl = p.picture;
    await existing.save();
    return { customer: existing.toObject(), created: false };
  }
  if (await Customer.exists({ email })) throw conflict("ACCOUNT_LINK_CONFLICT", "An account with this email exists under a different sign-in identity");
  try {
    const c = await Customer.create({ googleId: p.sub, email, emailVerified: true, firstName: p.given_name, lastName: p.family_name, displayName: p.name, avatarUrl: p.picture, lastLoginAt: now });
    return { customer: c.toObject(), created: true };
  } catch (e) {
    if (isDuplicateKeyError(e)) throw conflict("ACCOUNT_LINK_CONFLICT", "Account already exists"); // lost a race with a concurrent sign-in
    throw e;
  }
}

export async function getOwnProfile(customerId: string) {
  await connectDB();
  const c = await Customer.findOne({ _id: toObjectId(customerId), status: "active" }).lean();
  if (!c) throw notFound("Customer");
  return toCustomerProfile(c as CustomerDoc);
}

export async function updateOwnProfile(customerId: string, patch: CustomerSelfUpdate) {
  await connectDB();
  const d = customerSelfUpdateSchema.parse(patch); // strict allowlist: status/role/googleId/email are rejected
  const { marketingConsent, ...rest } = d;
  const set: Record<string, unknown> = { ...rest };
  if (rest.phone !== undefined) set.phoneVerified = false;
  if (marketingConsent !== undefined) set.marketingConsent = { granted: marketingConsent, grantedAt: new Date() };
  const c = await Customer.findOneAndUpdate({ _id: toObjectId(customerId), status: "active" }, { $set: set }, { new: true, runValidators: true }).lean();
  if (!c) throw notFound("Customer");
  return toCustomerProfile(c as CustomerDoc);
}

export async function addAddress(customerId: string, input: AddressInput, opts: { makeDefaultShipping?: boolean; makeDefaultBilling?: boolean } = {}) {
  await connectDB();
  const a = addressSchema.parse(input);
  const cid = toObjectId(customerId);
  // Atomic cap: only push while fewer than 10 addresses exist.
  const c = await Customer.findOneAndUpdate({ _id: cid, status: "active", "addresses.9": { $exists: false } }, { $push: { addresses: a } }, { new: true });
  if (!c) throw conflict("ADDRESS_LIMIT", "Customer not found or address limit (10) reached");
  const added = c.addresses[c.addresses.length - 1]!;
  const setDefaults: Record<string, unknown> = {};
  if (opts.makeDefaultShipping || !c.defaultShippingAddressId) setDefaults.defaultShippingAddressId = added._id;
  if (opts.makeDefaultBilling || !c.defaultBillingAddressId) setDefaults.defaultBillingAddressId = added._id;
  if (Object.keys(setDefaults).length) await Customer.updateOne({ _id: cid }, { $set: setDefaults });
  return String(added._id);
}

export async function removeAddress(customerId: string, addressId: string) {
  await connectDB();
  const cid = toObjectId(customerId);
  const aid = toObjectId(addressId, "addressId");
  await Customer.updateOne({ _id: cid }, { $pull: { addresses: { _id: aid } } });
  await Customer.updateOne({ _id: cid, defaultShippingAddressId: aid }, { $unset: { defaultShippingAddressId: 1 } });
  await Customer.updateOne({ _id: cid, defaultBillingAddressId: aid }, { $unset: { defaultBillingAddressId: 1 } });
}

/**
 * ANONYMIZATION POLICY: PII is scrubbed from the customer record; orders keep their own address/customer snapshots
 * (tax & legal retention) and are unaffected. The document itself is kept so order/review/ticket references stay valid.
 */
export async function anonymizeCustomer(customerId: string) {
  await connectDB();
  const id = toObjectId(customerId);
  const r = await Customer.updateOne(
    { _id: id, status: { $ne: "deleted" } },
    {
      $set: { status: "deleted", deletedAt: new Date(), googleId: `deleted:${id}`, email: `deleted+${id}@petblitz.invalid`, displayName: "Deleted user", emailVerified: false, phoneVerified: false, addresses: [], preferences: {}, marketingConsent: { granted: false } },
      $unset: { firstName: 1, lastName: 1, phone: 1, avatarUrl: 1, defaultShippingAddressId: 1, defaultBillingAddressId: 1 },
    },
  );
  return { anonymized: r.modifiedCount === 1 };
}

/** Admin-only: the ONLY path that can change account status. Not reachable from customer-facing input schemas. */
export async function setCustomerStatus(customerId: string, status: "active" | "suspended") {
  await connectDB();
  const r = await Customer.updateOne({ _id: toObjectId(customerId), status: { $ne: "deleted" } }, { $set: { status } });
  if (!r.matchedCount) throw notFound("Customer");
}

export async function updateAddress(customerId: string, addressId: string, input: Partial<AddressInput>) {
  await connectDB();
  const d = addressSchema.partial().parse(input);
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (v !== undefined) set[`addresses.$.${k}`] = v;
  if (!Object.keys(set).length) throw new AppError("VALIDATION_ERROR", 400, "Nothing to update");
  const r = await Customer.updateOne({ _id: toObjectId(customerId), status: "active", "addresses._id": toObjectId(addressId, "addressId") }, { $set: set }, { runValidators: true });
  if (!r.matchedCount) throw notFound("Address");
}

export async function setDefaultAddress(customerId: string, addressId: string, which: { shipping?: boolean; billing?: boolean }) {
  await connectDB();
  const aid = toObjectId(addressId, "addressId");
  const set: Record<string, unknown> = {};
  if (which.shipping) set.defaultShippingAddressId = aid;
  if (which.billing) set.defaultBillingAddressId = aid;
  if (!Object.keys(set).length) throw new AppError("VALIDATION_ERROR", 400, "Choose shipping and/or billing");
  const r = await Customer.updateOne({ _id: toObjectId(customerId), status: "active", "addresses._id": aid }, { $set: set });
  if (!r.matchedCount) throw notFound("Address");
}

// ---------------------------------------------------------------- admin reads
export async function listCustomersAdmin(opts: { q?: string; status?: string; page: number; pageSize: number }) {
  await connectDB();
  const f: Record<string, unknown> = {};
  if (opts.status) f.status = opts.status;
  if (opts.q) f.email = opts.q.trim().toLowerCase(); // exact match: index-friendly and no regex from user input
  const [rows, total] = await Promise.all([
    Customer.find(f, { googleId: 0, addresses: 0 }).sort({ createdAt: -1 }).skip((opts.page - 1) * opts.pageSize).limit(opts.pageSize).lean(),
    Customer.countDocuments(f),
  ]);
  return { items: rows, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.max(1, Math.ceil(total / opts.pageSize)) };
}

export async function getCustomerAdmin(id: string) {
  await connectDB();
  const c = await Customer.findById(toObjectId(id), { googleId: 0 }).lean();
  if (!c) throw notFound("Customer");
  return c;
}
