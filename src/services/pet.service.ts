import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { getEnv } from "@/lib/env";
import { AppError, conflict, isDuplicateKeyError, notFound } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { escapeRegex, slugify } from "@/lib/sanitize";
import { withTextFallback } from "@/lib/search";
import { nextPetCode } from "@/lib/sequence";
import { Category } from "@/models/Category";
import { Pet, PetDoc } from "@/models/Pet";
import { getPublicCategoryIds, resolvePublicCategoryIds, validateCategoryAssignment } from "./category.service";
import { CreatePetInput, PetListQuery, UpdatePetInput, createPetSchema, petListQuery, updatePetSchema } from "@/validations/pet.validation";
import { pageMeta } from "@/validations/common";

type PetLean = PetDoc;

/** Explicit allowlist. Private fields (health.internalNotes, microchipId, documents, vaccination.records, reservation) are never selected. */
const PUBLIC_PET_FIELDS = "name slug petCode type categoryId breed shortDescription description extraDescriptions customDetails dateOfBirth age gender color weightKg vaccination.status health.publicDisclosure media price discountType discountValue finalPrice currency availabilityStatus isFeatured careInfo ratingSummary publishedAt createdAt";

export function toPublicPet(p: PetLean, cat?: { name: string; slug: string }) {
  return {
    id: String(p._id), petCode: p.petCode, name: p.name, slug: p.slug, type: p.type,
    category: cat ? { id: String(p.categoryId), name: cat.name, slug: cat.slug } : { id: String(p.categoryId) },
    breed: p.breed, shortDescription: p.shortDescription, description: p.description,
    extraDescriptions: (p.extraDescriptions ?? []).map((x) => ({ shortDescription: x.shortDescription, description: x.description })),
    customDetails: (p.customDetails ?? []).map((x) => ({ name: x.name, value: x.value })), dateOfBirth: p.dateOfBirth, age: p.age,
    gender: p.gender, color: p.color, weightKg: p.weightKg,
    vaccinationStatus: p.vaccination?.status, healthDisclosure: p.health?.publicDisclosure,
    media: [...(p.media ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((m) => ({ kind: m.kind, url: m.url, alt: m.alt, mimeType: m.mimeType, isPrimary: m.isPrimary })),
    pricing: { price: p.price, discountType: p.discountType, discountValue: p.discountValue, finalPrice: p.finalPrice, currency: p.currency },
    availability: p.availabilityStatus, isFeatured: p.isFeatured, careInfo: p.careInfo,
    rating: { count: p.ratingSummary?.count ?? 0, average: p.ratingSummary?.count ? Math.round((p.ratingSummary.sum / p.ratingSummary.count) * 10) / 10 : null },
  };
}

const SORTS = { newest: { createdAt: -1 }, price_asc: { finalPrice: 1 }, price_desc: { finalPrice: -1 }, featured: { isFeatured: -1, createdAt: -1 } } as const;

export async function listPublicPets(rawQuery: unknown) {
  await connectDB();
  const q: PetListQuery = petListQuery.parse(rawQuery);
  const eligible = await getPublicCategoryIds();
  let allowed = [...eligible].map((x) => new Types.ObjectId(x));
  if (q.category) {
    const ids = await resolvePublicCategoryIds(q.category);
    if (!ids) return { items: [], ...pageMeta(q, 0) };
    allowed = ids.filter((i) => eligible.has(String(i)));
  }
  const filter: Record<string, unknown> = { status: "published", isVisible: true, availabilityStatus: { $in: ["available", "reserved"] }, categoryId: { $in: allowed } };
  if (q.type) filter.type = q.type;
  if (q.breed) filter.breed = new RegExp(`^${escapeRegex(q.breed)}$`, "i");
  if (q.featured !== undefined) filter.isFeatured = q.featured;
  if (q.minPrice !== undefined || q.maxPrice !== undefined) filter.finalPrice = { ...(q.minPrice !== undefined ? { $gte: q.minPrice } : {}), ...(q.maxPrice !== undefined ? { $lte: q.maxPrice } : {}) };
  const useText = !!q.q;
  if (q.q) filter.$text = { $search: q.q }; // text index (weighted name > breed/brand > description); falls back to regex below if the index is missing

  const run = () => Promise.all([
    Pet.find(filter).select(PUBLIC_PET_FIELDS).sort(SORTS[q.sort] as Record<string, 1 | -1>).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
    Pet.countDocuments(filter),
  ]);
  const [rows, total] = await withTextFallback(useText, filter, q.q, "$or", (r) => [{ name: r }, { breed: r }], run);
  const cats = await Category.find({ _id: { $in: [...new Set(rows.map((r) => String(r.categoryId)))] } }, { name: 1, slug: 1 }).lean();
  const cmap = new Map(cats.map((c) => [String(c._id), { name: c.name, slug: c.slug }]));
  return { items: rows.map((r) => toPublicPet(r as PetLean, cmap.get(String(r.categoryId)))), ...pageMeta(q, total) };
}

export async function getPublicPetBySlug(slug: string) {
  await connectDB();
  const p = await Pet.findOne({ slug, status: "published", isVisible: true }).select(PUBLIC_PET_FIELDS).lean();
  if (!p || !(await getPublicCategoryIds()).has(String(p.categoryId))) throw notFound("Pet");
  const c = await Category.findById(p.categoryId, { name: 1, slug: 1 }).lean();
  return toPublicPet(p as PetLean, c ? { name: c.name, slug: c.slug } : undefined);
}

// ---------------------------------------------------------------- admin write services
export async function createPet(input: CreatePetInput, actorId?: string) {
  await connectDB();
  const d = createPetSchema.parse(input);
  await validateCategoryAssignment(d.categoryId, { entity: "pet", petType: d.type });
  const petCode = d.petCode ?? (await nextPetCode());
  const slug = d.slug ?? slugify(`${d.name}-${petCode}`);
  try {
    const doc = await Pet.create({ ...d, petCode, slug, createdBy: actorId ? toObjectId(actorId) : undefined });
    return doc.toObject();
  } catch (e) {
    if (isDuplicateKeyError(e)) throw conflict("PET_DUPLICATE", "Slug, pet code or microchip already exists");
    throw e;
  }
}

export async function updatePet(id: string, patch: UpdatePetInput, actorId?: string) {
  await connectDB();
  const d = updatePetSchema.parse(patch);
  const pet = await Pet.findById(toObjectId(id));
  if (!pet) throw notFound("Pet");
  if (pet.availabilityStatus === "sold" && (d.price !== undefined || d.type !== undefined || d.categoryId !== undefined)) {
    throw conflict("PET_SOLD", "Sold pets cannot change price, type or category");
  }
  const type = d.type ?? pet.type;
  const categoryId = d.categoryId ?? String(pet.categoryId);
  if (d.type !== undefined || d.categoryId !== undefined) await validateCategoryAssignment(categoryId, { entity: "pet", petType: type });
  pet.set({ ...d, updatedBy: actorId ? toObjectId(actorId) : undefined });
  try {
    await pet.save(); // runs hooks: finalPrice recalculation + publish rules
  } catch (e) {
    if (isDuplicateKeyError(e)) throw conflict("PET_DUPLICATE", "Slug, pet code or microchip already exists");
    throw e;
  }
  return pet.toObject();
}

export async function setPetPublication(id: string, status: "published" | "draft" | "archived") {
  await connectDB();
  const pet = await Pet.findById(toObjectId(id));
  if (!pet) throw notFound("Pet");
  if (status === "archived" && pet.availabilityStatus === "reserved" && pet.reservation?.expiresAt && pet.reservation.expiresAt > new Date()) {
    throw conflict("PET_RESERVED", "Pet has an active reservation");
  }
  pet.status = status;
  if (status === "published" && !pet.publishedAt) pet.publishedAt = new Date();
  await pet.save();
  return pet.toObject();
}
// NOTE: there is intentionally NO hard-delete for pets. Sold pets are historical records; use archive.

// ---------------------------------------------------------------- atomic reservation / sale
/** Atomically reserves a pet (also takes over an EXPIRED reservation). Returns the post-reservation document or throws 409. */
export async function reservePet(petId: string | Types.ObjectId, customerId: Types.ObjectId, orderId: Types.ObjectId, ttlMinutes = getEnv().RESERVATION_TTL_MINUTES) {
  await connectDB();
  const now = new Date();
  const pet = await Pet.findOneAndUpdate(
    {
      _id: toObjectId(petId), status: "published", isVisible: true,
      $or: [{ availabilityStatus: "available" }, { availabilityStatus: "reserved", "reservation.expiresAt": { $lte: now } }],
    },
    { $set: { availabilityStatus: "reserved", reservation: { customerId, orderId, reservedAt: now, expiresAt: new Date(now.getTime() + ttlMinutes * 60_000) } } },
    { new: true },
  ).lean();
  if (!pet) throw conflict("PET_UNAVAILABLE", "This pet is no longer available");
  return pet as PetLean;
}

/** Idempotent: only releases a reservation that belongs to this order. */
export async function releasePetReservation(petId: Types.ObjectId, orderId: Types.ObjectId): Promise<boolean> {
  await connectDB();
  const r = await Pet.updateOne({ _id: petId, availabilityStatus: "reserved", "reservation.orderId": orderId }, { $set: { availabilityStatus: "available" }, $unset: { reservation: 1 } });
  return r.modifiedCount === 1;
}

/** Idempotent; a pet can only move reserved(by this order) -> sold, so it can never be sold twice. */
export async function markPetSold(petId: Types.ObjectId, orderId: Types.ObjectId): Promise<void> {
  await connectDB();
  const r = await Pet.updateOne({ _id: petId, availabilityStatus: "reserved", "reservation.orderId": orderId }, { $set: { availabilityStatus: "sold", soldAt: new Date(), soldOrderId: orderId }, $unset: { reservation: 1 } });
  if (r.modifiedCount === 1) return;
  if (await Pet.exists({ _id: petId, availabilityStatus: "sold", soldOrderId: orderId })) return; // already done
  throw conflict("PET_SALE_REJECTED", "Pet is not reserved for this order");
}

/** Used when a PAID order is cancelled/refunded: makes the pet available again (admin policy). */
export async function restorePetFromSale(petId: Types.ObjectId, orderId: Types.ObjectId): Promise<void> {
  await connectDB();
  await Pet.updateOne({ _id: petId, soldOrderId: orderId }, { $set: { availabilityStatus: "available" }, $unset: { soldAt: 1, soldOrderId: 1, reservation: 1 } });
}

/** Sweep: releases reservations whose TTL has passed. Safe to run repeatedly. */
export async function releaseExpiredPetReservations(now = new Date()): Promise<number> {
  await connectDB();
  const r = await Pet.updateMany({ availabilityStatus: "reserved", "reservation.expiresAt": { $lte: now } }, { $set: { availabilityStatus: "available" }, $unset: { reservation: 1 } });
  return r.modifiedCount;
}

export { AppError };

// ---------------------------------------------------------------- admin reads / availability
export interface AdminPetQuery { status?: string; availability?: string; type?: string; categoryId?: string; q?: string; page: number; pageSize: number }

/** Admin list: FULL records including private fields. Never reachable from a public route. */
export async function listPetsAdmin(qy: AdminPetQuery) {
  await connectDB();
  const f: Record<string, unknown> = {};
  if (qy.status) f.status = qy.status;
  if (qy.availability) f.availabilityStatus = qy.availability;
  if (qy.type) f.type = qy.type;
  if (qy.categoryId) f.categoryId = toObjectId(qy.categoryId, "categoryId");
  if (qy.q) { const r = new RegExp(escapeRegex(qy.q), "i"); f.$or = [{ name: r }, { petCode: r }, { breed: r }]; }
  const [items, total] = await Promise.all([Pet.find(f).sort({ createdAt: -1 }).skip((qy.page - 1) * qy.pageSize).limit(qy.pageSize).lean(), Pet.countDocuments(f)]);
  return { items, page: qy.page, pageSize: qy.pageSize, total, totalPages: Math.max(1, Math.ceil(total / qy.pageSize)) };
}

export async function getPetAdmin(id: string) {
  await connectDB();
  const p = await Pet.findById(toObjectId(id)).lean();
  if (!p) throw notFound("Pet");
  return p;
}

/** Manual availability toggle. Sold pets and pets with a live reservation cannot be changed here. */
export async function setPetAvailability(id: string, status: "available" | "unavailable") {
  await connectDB();
  const oid = toObjectId(id);
  const now = new Date();
  const r = await Pet.findOneAndUpdate(
    { _id: oid, $or: [{ availabilityStatus: { $in: ["available", "unavailable"] } }, { availabilityStatus: "reserved", "reservation.expiresAt": { $lte: now } }] },
    { $set: { availabilityStatus: status }, $unset: { reservation: 1 } },
    { new: true },
  ).lean();
  if (!r) {
    if (!(await Pet.exists({ _id: oid }))) throw notFound("Pet");
    throw conflict("PET_LOCKED", "Pet is sold or has an active reservation");
  }
  return r;
}
