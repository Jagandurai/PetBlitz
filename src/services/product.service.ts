import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { conflict, isDuplicateKeyError, notFound, unprocessable } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { computeStockStatus } from "@/lib/inventory";
import { escapeRegex, slugify } from "@/lib/sanitize";
import { withTextFallback } from "@/lib/search";
import { Category } from "@/models/Category";
import { Product, ProductDoc } from "@/models/Product";
import { InventoryMovement } from "@/models/Ops";
import { getPublicCategoryIds, resolvePublicCategoryIds, validateCategoryAssignment } from "./category.service";
import { CreateProductInput, ProductListQuery, UpdateProductInput, createProductSchema, productListQuery, updateProductSchema } from "@/validations/product.validation";
import { pageMeta } from "@/validations/common";

type ProductLean = ProductDoc;

const PUBLIC_PRODUCT_FIELDS = "name slug sku shortDescription description extraDescriptions productType categoryId subcategoryId compatibility brand specifications material colors sizes media price discountType discountValue finalPrice currency trackInventory stockQuantity reservedQuantity lowStockThreshold backorderPolicy isFeatured isNewArrival ratingSummary publishedAt createdAt";

export function toPublicProduct(p: ProductLean, cat?: { name: string; slug: string }) {
  const stock = computeStockStatus({ trackInventory: p.trackInventory, stockQuantity: p.stockQuantity, reservedQuantity: p.reservedQuantity, lowStockThreshold: p.lowStockThreshold, backorderPolicy: p.backorderPolicy as "deny" | "allow" });
  return {
    id: String(p._id), sku: p.sku, name: p.name, slug: p.slug, shortDescription: p.shortDescription, description: p.description, extraDescriptions: (p.extraDescriptions ?? []).map((x) => ({ shortDescription: x.shortDescription, description: x.description })), productType: p.productType,
    category: cat ? { id: String(p.categoryId), name: cat.name, slug: cat.slug } : { id: String(p.categoryId) },
    subcategoryId: p.subcategoryId ? String(p.subcategoryId) : undefined, compatibility: p.compatibility, brand: p.brand, specifications: p.specifications,
    material: p.material, colors: p.colors, sizes: p.sizes,
    media: [...(p.media ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((m) => ({ kind: m.kind, url: m.url, alt: m.alt, isPrimary: m.isPrimary })),
    pricing: { price: p.price, discountType: p.discountType, discountValue: p.discountValue, finalPrice: p.finalPrice, currency: p.currency },
    stockStatus: stock.stockStatus, // exact quantities / reservations stay private
    isFeatured: p.isFeatured, isNewArrival: p.isNewArrival,
    rating: { count: p.ratingSummary?.count ?? 0, average: p.ratingSummary?.count ? Math.round((p.ratingSummary.sum / p.ratingSummary.count) * 10) / 10 : null },
  };
}

const SORTS = { newest: { createdAt: -1 }, price_asc: { finalPrice: 1 }, price_desc: { finalPrice: -1 }, featured: { isFeatured: -1, createdAt: -1 } } as const;

export async function listPublicProducts(rawQuery: unknown) {
  await connectDB();
  const q: ProductListQuery = productListQuery.parse(rawQuery);
  const eligible = await getPublicCategoryIds();
  let allowed = [...eligible].map((x) => new Types.ObjectId(x));
  if (q.category) {
    const ids = await resolvePublicCategoryIds(q.category);
    if (!ids) return { items: [], ...pageMeta(q, 0) };
    allowed = ids.filter((i) => eligible.has(String(i)));
  }
  const filter: Record<string, unknown> = { status: "published", isVisible: true, categoryId: { $in: allowed } };
  if (q.brand) filter.brand = new RegExp(`^${escapeRegex(q.brand)}$`, "i");
  if (q.compatibility) filter.compatibility = q.compatibility;
  if (q.featured !== undefined) filter.isFeatured = q.featured;
  if (q.minPrice !== undefined || q.maxPrice !== undefined) filter.finalPrice = { ...(q.minPrice !== undefined ? { $gte: q.minPrice } : {}), ...(q.maxPrice !== undefined ? { $lte: q.maxPrice } : {}) };
  const useText = !!q.q;
  if (q.q) filter.$text = { $search: q.q }; // text index (weighted name > breed/brand > description); falls back to regex below if the index is missing
  if (q.inStock) {
    filter.$and = [{ $or: [{ trackInventory: false }, { backorderPolicy: "allow" }, { $expr: { $gt: [{ $subtract: ["$stockQuantity", "$reservedQuantity"] }, 0] } }] }];
  }
  const run = () => Promise.all([
    Product.find(filter).select(PUBLIC_PRODUCT_FIELDS).sort(SORTS[q.sort] as Record<string, 1 | -1>).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
    Product.countDocuments(filter),
  ]);
  const [rows, total] = await withTextFallback(useText, filter, q.q, "$or", (r) => [{ name: r }, { brand: r }, { sku: r }], run);
  const cats = await Category.find({ _id: { $in: [...new Set(rows.map((r) => String(r.categoryId)))] } }, { name: 1, slug: 1 }).lean();
  const cmap = new Map(cats.map((c) => [String(c._id), { name: c.name, slug: c.slug }]));
  return { items: rows.map((r) => toPublicProduct(r as ProductLean, cmap.get(String(r.categoryId)))), ...pageMeta(q, total) };
}

export async function getPublicProductBySlug(slug: string) {
  await connectDB();
  const p = await Product.findOne({ slug, status: "published", isVisible: true }).select(PUBLIC_PRODUCT_FIELDS).lean();
  if (!p || !(await getPublicCategoryIds()).has(String(p.categoryId))) throw notFound("Product");
  const c = await Category.findById(p.categoryId, { name: 1, slug: 1 }).lean();
  return toPublicProduct(p as ProductLean, c ? { name: c.name, slug: c.slug } : undefined);
}

// ---------------------------------------------------------------- admin write services
async function validateProductCategories(categoryId: string, subcategoryId?: string) {
  const cat = await validateCategoryAssignment(categoryId, { entity: "product" });
  if (subcategoryId) {
    const sub = await validateCategoryAssignment(subcategoryId, { entity: "product" });
    if (!(sub.path ?? []).some((a) => a.equals(cat._id))) throw unprocessable("SUBCATEGORY_INVALID", "subcategoryId must be a descendant of categoryId");
  }
}

export async function createProduct(input: CreateProductInput, actorId?: string) {
  await connectDB();
  const d = createProductSchema.parse(input);
  await validateProductCategories(d.categoryId, d.subcategoryId);
  try {
    const doc = await Product.create({ ...d, slug: d.slug ?? slugify(d.name), sku: d.sku.toUpperCase(), reservedQuantity: 0, createdBy: actorId ? toObjectId(actorId) : undefined });
    return doc.toObject();
  } catch (e) {
    if (isDuplicateKeyError(e)) throw conflict("PRODUCT_DUPLICATE", "Slug or SKU already exists");
    throw e;
  }
}

export async function updateProduct(id: string, patch: UpdateProductInput, actorId?: string) {
  await connectDB();
  const d = updateProductSchema.parse(patch);
  const p = await Product.findById(toObjectId(id));
  if (!p) throw notFound("Product");
  if (d.categoryId !== undefined || d.subcategoryId !== undefined) await validateProductCategories(d.categoryId ?? String(p.categoryId), d.subcategoryId ?? (p.subcategoryId ? String(p.subcategoryId) : undefined));
  if (d.stockQuantity !== undefined && d.stockQuantity < p.reservedQuantity && p.trackInventory) throw conflict("STOCK_BELOW_RESERVED", "stockQuantity cannot be lower than reservedQuantity");
  p.set({ ...d, ...(d.sku ? { sku: d.sku.toUpperCase() } : {}), updatedBy: actorId ? toObjectId(actorId) : undefined });
  try { await p.save(); } catch (e) {
    if (isDuplicateKeyError(e)) throw conflict("PRODUCT_DUPLICATE", "Slug or SKU already exists");
    throw e;
  }
  return p.toObject();
}

export async function setProductPublication(id: string, status: "published" | "draft" | "archived") {
  await connectDB();
  const p = await Product.findById(toObjectId(id));
  if (!p) throw notFound("Product");
  p.status = status;
  if (status === "published" && !p.publishedAt) p.publishedAt = new Date();
  await p.save();
  return p.toObject();
}
// NOTE: no hard-delete. Products referenced by historical orders must remain; archive instead.

// ---------------------------------------------------------------- atomic inventory
/**
 * Reserves stock WITHOUT oversell: the availability check and the $inc happen in ONE atomic update.
 * Returns the post-update product (for price snapshots) or throws 409.
 */
export async function reserveStock(productId: Types.ObjectId, qty: number): Promise<ProductLean> {
  await connectDB();
  if (!Number.isInteger(qty) || qty < 1) throw unprocessable("INVALID_QUANTITY", "Quantity must be a positive integer");
  const p = await Product.findOneAndUpdate(
    {
      _id: productId, status: "published", isVisible: true,
      $or: [{ trackInventory: false }, { backorderPolicy: "allow" }, { $expr: { $gte: [{ $subtract: ["$stockQuantity", "$reservedQuantity"] }, qty] } }],
    },
    [{ $set: { reservedQuantity: { $cond: [{ $eq: ["$trackInventory", true] }, { $add: ["$reservedQuantity", qty] }, "$reservedQuantity"] } } }],
    { new: true },
  ).lean();
  if (!p) throw conflict("OUT_OF_STOCK", "Insufficient stock");
  return p as ProductLean;
}

/** Releases a reservation (order cancelled/expired). Never goes below zero. */
export async function releaseStock(productId: Types.ObjectId, qty: number): Promise<void> {
  await connectDB();
  await Product.updateOne({ _id: productId, trackInventory: true }, [{ $set: { reservedQuantity: { $max: [0, { $subtract: ["$reservedQuantity", qty] }] } } }]);
}

async function logMovement(productId: Types.ObjectId, delta: number, stockAfter: number, reason: "admin_adjust" | "order_commit" | "order_restock", extra: { orderId?: Types.ObjectId; actorId?: string } = {}) {
  try { await InventoryMovement.create({ productId, delta, stockAfter, reason, ...extra }); } catch (e) { console.error("[inventory] movement log failed", e instanceof Error ? e.name : "error"); }
}

/** Payment confirmed: converts reserved -> sold (decrements stock and reservation). Callers guard idempotency per order item. */
export async function commitStock(productId: Types.ObjectId, qty: number, orderId?: Types.ObjectId): Promise<void> {
  await connectDB();
  const before = await Product.findOneAndUpdate({ _id: productId, trackInventory: true }, [
    { $set: { stockQuantity: { $max: [0, { $subtract: ["$stockQuantity", qty] }] }, reservedQuantity: { $max: [0, { $subtract: ["$reservedQuantity", qty] }] } } },
  ], { new: false }).lean();
  if (before) await logMovement(productId, -Math.min(qty, before.stockQuantity), Math.max(0, before.stockQuantity - qty), "order_commit", { orderId });
}

/** Refund/cancel of a committed sale: puts units back on the shelf. */
export async function restockCommitted(productId: Types.ObjectId, qty: number, orderId?: Types.ObjectId): Promise<void> {
  await connectDB();
  const after = await Product.findOneAndUpdate({ _id: productId, trackInventory: true }, { $inc: { stockQuantity: qty } }, { new: true }).lean();
  if (after) await logMovement(productId, qty, after.stockQuantity, "order_restock", { orderId });
}

// ---------------------------------------------------------------- admin reads / stock management
export interface AdminProductQuery { status?: string; categoryId?: string; lowStock?: boolean; q?: string; page: number; pageSize: number }

export async function listProductsAdmin(qy: AdminProductQuery) {
  await connectDB();
  const f: Record<string, unknown> = {};
  if (qy.status) f.status = qy.status;
  if (qy.categoryId) f.categoryId = toObjectId(qy.categoryId, "categoryId");
  if (qy.q) { const r = new RegExp(escapeRegex(qy.q), "i"); f.$or = [{ name: r }, { sku: r }, { brand: r }]; }
  if (qy.lowStock) f.$expr = { $and: [{ $eq: ["$trackInventory", true] }, { $lte: [{ $subtract: ["$stockQuantity", "$reservedQuantity"] }, "$lowStockThreshold"] }] };
  const [items, total] = await Promise.all([Product.find(f).sort({ createdAt: -1 }).skip((qy.page - 1) * qy.pageSize).limit(qy.pageSize).lean(), Product.countDocuments(f)]);
  return { items: items.map((p) => ({ ...p, ...computeStockStatus({ trackInventory: p.trackInventory, stockQuantity: p.stockQuantity, reservedQuantity: p.reservedQuantity, lowStockThreshold: p.lowStockThreshold, backorderPolicy: p.backorderPolicy as "deny" | "allow" }) })), page: qy.page, pageSize: qy.pageSize, total, totalPages: Math.max(1, Math.ceil(total / qy.pageSize)) };
}

export async function getProductAdmin(id: string) {
  await connectDB();
  const p = await Product.findById(toObjectId(id)).lean();
  if (!p) throw notFound("Product");
  return { ...p, ...computeStockStatus({ trackInventory: p.trackInventory, stockQuantity: p.stockQuantity, reservedQuantity: p.reservedQuantity, lowStockThreshold: p.lowStockThreshold, backorderPolicy: p.backorderPolicy as "deny" | "allow" }) };
}

/**
 * Admin stock change, ONE atomic update that can never push stock below zero or below the quantity currently reserved by
 * open orders (so it cannot invalidate reservations that are racing with checkout).
 *   mode "set":    stockQuantity = value            (value >= reservedQuantity)
 *   mode "adjust": stockQuantity += value (+/-)     (result >= max(0, reservedQuantity))
 */
export async function adjustStock(id: string, input: { mode: "set" | "adjust"; value: number }, actorId?: string) {
  await connectDB();
  const oid = toObjectId(id);
  if (!Number.isInteger(input.value)) throw unprocessable("INVALID_QUANTITY", "Quantity must be an integer");
  if (input.mode === "set" && input.value < 0) throw unprocessable("INVALID_QUANTITY", "Stock cannot be negative");
  const next = input.mode === "set" ? input.value : { $add: ["$stockQuantity", input.value] };
  const filter = { _id: oid, trackInventory: true, $expr: { $and: [{ $gte: [input.mode === "set" ? input.value : { $add: ["$stockQuantity", input.value] }, 0] }, { $gte: [input.mode === "set" ? input.value : { $add: ["$stockQuantity", input.value] }, "$reservedQuantity"] }] } };
  const before = (await Product.findById(oid, { stockQuantity: 1 }).lean())?.stockQuantity;
  const upd = await Product.findOneAndUpdate(filter, [{ $set: { stockQuantity: next, ...(actorId ? { updatedBy: new Types.ObjectId(actorId) } : {}) } }], { new: true }).lean();
  if (!upd) {
    const cur = await Product.findById(oid, { trackInventory: 1 }).lean();
    if (!cur) throw notFound("Product");
    if (!cur.trackInventory) throw conflict("INVENTORY_NOT_TRACKED", "Inventory tracking is disabled for this product");
    throw conflict("STOCK_BELOW_RESERVED", "Resulting stock would be negative or below the quantity reserved by open orders");
  }
  await logMovement(oid, input.mode === "set" ? upd.stockQuantity - (before ?? upd.stockQuantity) : input.value, upd.stockQuantity, "admin_adjust", { actorId });
  return { id: String(upd._id), ...computeStockStatus({ trackInventory: upd.trackInventory, stockQuantity: upd.stockQuantity, reservedQuantity: upd.reservedQuantity, lowStockThreshold: upd.lowStockThreshold, backorderPolicy: upd.backorderPolicy as "deny" | "allow" }), stockQuantity: upd.stockQuantity, reservedQuantity: upd.reservedQuantity };
}
