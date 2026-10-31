import { ClientSession, Types } from "mongoose";
import { connectDB, withTransaction } from "@/lib/db/connection";
import { getEnv } from "@/lib/env";
import { AppError, conflict, isDuplicateKeyError, notFound, unprocessable } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { slugify } from "@/lib/sanitize";
import { Category, CategoryDoc, CategoryType } from "@/models/Category";
import { Order } from "@/models/Order";
import { Pet } from "@/models/Pet";
import { Product } from "@/models/Product";
import { CreateCategoryInput, UpdateCategoryInput, createCategorySchema, updateCategorySchema } from "@/validations/category.validation";

/**
 * Categories are 100% database-driven. Nothing in this file (or any other application file) lists category names.
 *
 * BEHAVIOUR WHEN A PARENT IS HIDDEN / DEACTIVATED / ARCHIVED
 *  - Flags are NOT cascaded to children (no silent data change). Instead, public eligibility is computed from the
 *    whole ancestor chain: a node is public only if it AND every ancestor is active, visible and not archived.
 *    Un-hiding the parent therefore restores the subtree exactly as it was.
 *  - Archiving requires an explicit choice (archive descendants, or have no active children) and explicit
 *    reassignment of dependent pets/products. Nothing is deleted.
 */

export type Scope = "public" | "admin";
type Lean = CategoryDoc;
const PUBLIC_FILTER = { isActive: true, isVisible: true, archivedAt: null } as const;
interface Actor { actorId?: string }

export interface CategoryDto {
  id: string; name: string; slug: string; description?: string; type: CategoryType; parentId: string | null; level: number;
  image?: { url: string; alt?: string; storageKey?: string }; icon?: string; sortOrder: number; isFeatured: boolean;
  seoTitle?: string; seoDescription?: string;
  // admin-only fields (undefined in public DTOs)
  path?: string[]; isActive?: boolean; isVisible?: boolean; archivedAt?: Date | null; slugHistory?: string[]; seedKey?: string; createdAt?: Date; updatedAt?: Date;
}
export interface CategoryNode extends CategoryDto { children: CategoryNode[] }

export function toCategoryDto(c: Lean, scope: Scope): CategoryDto {
  const base: CategoryDto = {
    id: String(c._id), name: c.name, slug: c.slug, description: c.description ?? undefined, type: c.type as CategoryType,
    parentId: c.parentId ? String(c.parentId) : null, level: c.level,
    image: c.image ? { url: c.image.url, alt: c.image.alt ?? undefined, storageKey: scope === "admin" ? c.image.storageKey ?? undefined : undefined } : undefined,
    icon: c.icon ?? undefined, sortOrder: c.sortOrder ?? 0, isFeatured: !!c.isFeatured, seoTitle: c.seoTitle ?? undefined, seoDescription: c.seoDescription ?? undefined,
  };
  if (scope === "public") return base;
  return { ...base, path: (c.path ?? []).map(String), isActive: c.isActive, isVisible: c.isVisible, archivedAt: c.archivedAt ?? null, slugHistory: c.slugHistory, seedKey: c.seedKey ?? undefined, createdAt: c.createdAt, updatedAt: c.updatedAt };
}

const s = (session?: ClientSession) => session ?? null;

// ---------------------------------------------------------------- eligibility helpers
/** Ids of categories that are publicly eligible (node AND all ancestors active+visible+unarchived). */
export async function getPublicCategoryIds(): Promise<Set<string>> {
  await connectDB();
  const rows = await Category.find(PUBLIC_FILTER, { parentId: 1 }).lean();
  const byParent = new Map<string, string[]>();
  for (const r of rows) {
    const k = r.parentId ? String(r.parentId) : "root";
    (byParent.get(k) ?? byParent.set(k, []).get(k)!).push(String(r._id));
  }
  const out = new Set<string>();
  const stack = [...(byParent.get("root") ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    out.add(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return out;
}

async function isChainPublic(c: Lean): Promise<boolean> {
  if (!(c.isActive && c.isVisible && !c.archivedAt)) return false;
  if (!c.path?.length) return true;
  const bad = await Category.countDocuments({ _id: { $in: c.path }, $or: [{ isActive: false }, { isVisible: false }, { archivedAt: { $ne: null } }] });
  return bad === 0;
}

async function assertSlugFree(slug: string, excludeId?: Types.ObjectId) {
  const filter: Record<string, unknown> = { $or: [{ slug }, { slugHistory: slug }] };
  if (excludeId) filter._id = { $ne: excludeId };
  if (await Category.exists(filter)) throw conflict("CATEGORY_SLUG_TAKEN", `Slug "${slug}" is already in use`);
}

async function nextSortOrder(parentId: Types.ObjectId | null, session?: ClientSession) {
  const last = await Category.findOne({ parentId }, { sortOrder: 1 }).sort({ sortOrder: -1 }).session(s(session)).lean();
  return (last?.sortOrder ?? 0) + 10;
}

// ---------------------------------------------------------------- assignment validation
export type AssignmentTarget = { entity: "pet"; petType: "dog" | "cat" } | { entity: "product" };

/** Used by pet/product services. Throws unless the category can receive NEW assignments for that entity. */
export async function validateCategoryAssignment(categoryId: string | Types.ObjectId, target: AssignmentTarget, session?: ClientSession): Promise<Lean> {
  await connectDB();
  const cat = await Category.findById(toObjectId(categoryId, "categoryId")).session(s(session)).lean();
  if (!cat) throw unprocessable("CATEGORY_NOT_FOUND", "Category does not exist");
  if (cat.archivedAt || !cat.isActive) throw unprocessable("CATEGORY_UNAVAILABLE", "Category is archived or inactive");
  if (cat.path?.length) {
    const bad = await Category.countDocuments({ _id: { $in: cat.path }, $or: [{ isActive: false }, { archivedAt: { $ne: null } }] }).session(s(session));
    if (bad) throw unprocessable("CATEGORY_UNAVAILABLE", "An ancestor category is archived or inactive");
  }
  const expected = target.entity === "pet" ? target.petType : "accessory";
  if (cat.type !== expected) throw unprocessable("CATEGORY_INCOMPATIBLE", `A ${target.entity} cannot be assigned to a "${cat.type}" category`);
  return cat as Lean;
}

// ---------------------------------------------------------------- create / update
export async function createCategory(input: CreateCategoryInput, opts: Actor & { seedKey?: string; allowInactiveParent?: boolean } = {}): Promise<CategoryDto> {
  await connectDB();
  const data = createCategorySchema.parse(input);
  const maxDepth = getEnv().CATEGORY_MAX_DEPTH;

  let parent: Lean | null = null;
  if (data.parentId) {
    parent = (await Category.findById(data.parentId).lean()) as Lean | null;
    if (!parent) throw unprocessable("CATEGORY_PARENT_INVALID", "Parent category does not exist");
    if (parent.archivedAt) throw unprocessable("CATEGORY_PARENT_INVALID", "Parent category is archived");
    if (!parent.isActive && !opts.allowInactiveParent) throw unprocessable("CATEGORY_PARENT_INVALID", "Parent category is inactive");
    if (parent.path?.length && (await Category.exists({ _id: { $in: parent.path }, archivedAt: { $ne: null } }))) throw unprocessable("CATEGORY_PARENT_INVALID", "An ancestor of the parent is archived");
    if (data.type && data.type !== parent.type) throw unprocessable("CATEGORY_TYPE_MISMATCH", "Child type must match the parent's type");
  }
  const level = parent ? parent.level + 1 : 1;
  if (level > maxDepth) throw unprocessable("CATEGORY_MAX_DEPTH", `Maximum category depth is ${maxDepth}`);

  const slug = data.slug ?? slugify(data.name);
  if (!slug) throw new AppError("VALIDATION_ERROR", 400, "Could not derive a slug from the name; provide one");
  await assertSlugFree(slug);

  const parentOid = parent ? parent._id : null;
  try {
    const doc = await Category.create({
      name: data.name, slug, description: data.description, type: parent ? parent.type : data.type, parentId: parentOid, level,
      path: parent ? [...(parent.path ?? []), parent._id] : [], image: data.image, icon: data.icon,
      sortOrder: data.sortOrder ?? (await nextSortOrder(parentOid)), isActive: data.isActive ?? true, isVisible: data.isVisible ?? true,
      isFeatured: data.isFeatured ?? false, seoTitle: data.seoTitle, seoDescription: data.seoDescription,
      seedKey: opts.seedKey, createdBy: opts.actorId ? toObjectId(opts.actorId) : undefined,
    });
    return toCategoryDto(doc.toObject() as Lean, "admin");
  } catch (e) {
    if (isDuplicateKeyError(e)) throw conflict("CATEGORY_SLUG_TAKEN", "Slug or seed key already exists");
    throw e;
  }
}

export async function updateCategory(id: string, patch: UpdateCategoryInput, opts: Actor = {}): Promise<CategoryDto> {
  await connectDB();
  const data = updateCategorySchema.parse(patch);
  const oid = toObjectId(id);
  const cur = (await Category.findById(oid).lean()) as Lean | null;
  if (!cur) throw notFound("Category");

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  for (const k of ["name", "isFeatured"] as const) if (data[k] !== undefined) $set[k] = data[k];
  for (const k of ["description", "image", "icon", "seoTitle", "seoDescription"] as const) {
    if (data[k] === null) $unset[k] = 1;
    else if (data[k] !== undefined) $set[k] = data[k];
  }
  if (data.slug && data.slug !== cur.slug) {
    await assertSlugFree(data.slug, oid);
    $set.slug = data.slug;
    // keep old URL resolvable; drop the new slug from own history if the admin is reverting
    $set.slugHistory = [...new Set([...(cur.slugHistory ?? []), cur.slug])].filter((x) => x !== data.slug);
  }
  if (data.type && data.type !== cur.type) {
    // Changing classification would break pet/product compatibility and the parent/child type rule.
    if (cur.parentId) throw unprocessable("CATEGORY_TYPE_LOCKED", "Only root categories can change type");
    if (await Category.exists({ parentId: oid })) throw conflict("CATEGORY_HAS_CHILDREN", "Cannot change type of a category that has children");
    if ((await countDependents([oid])) > 0) throw conflict("CATEGORY_HAS_DEPENDENTS", "Cannot change type while pets/products are assigned");
    $set.type = data.type;
  }
  if (opts.actorId) $set.updatedBy = toObjectId(opts.actorId);
  if (!Object.keys($set).length && !Object.keys($unset).length) return toCategoryDto(cur, "admin");

  try {
    const updated = await Category.findOneAndUpdate({ _id: oid }, { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) }, { new: true, runValidators: true }).lean();
    return toCategoryDto(updated as Lean, "admin");
  } catch (e) {
    if (isDuplicateKeyError(e)) throw conflict("CATEGORY_SLUG_TAKEN", "Slug already exists");
    throw e;
  }
}

// ---------------------------------------------------------------- move / reorder
export async function moveCategory(id: string, newParentId: string | null, opts: Actor & { position?: number } = {}): Promise<CategoryDto> {
  await connectDB();
  const oid = toObjectId(id);
  const maxDepth = getEnv().CATEGORY_MAX_DEPTH;

  return withTransaction(async (session) => {
    const cat = (await Category.findById(oid).session(s(session)).lean()) as Lean | null;
    if (!cat) throw notFound("Category");
    if (cat.archivedAt) throw conflict("CATEGORY_ARCHIVED", "Restore the category before moving it");

    let newParent: Lean | null = null;
    if (newParentId) {
      const pid = toObjectId(newParentId, "parentId");
      if (pid.equals(oid)) throw unprocessable("CATEGORY_CYCLE", "A category cannot be its own parent");
      newParent = (await Category.findById(pid).session(s(session)).lean()) as Lean | null;
      if (!newParent) throw unprocessable("CATEGORY_PARENT_INVALID", "Parent category does not exist");
      if ((newParent.path ?? []).some((a) => a.equals(oid))) throw unprocessable("CATEGORY_CYCLE", "A category cannot be moved beneath its own descendant");
      if (newParent.archivedAt || !newParent.isActive) throw unprocessable("CATEGORY_PARENT_INVALID", "Target parent is archived or inactive");
      if (newParent.type !== cat.type) throw unprocessable("CATEGORY_TYPE_MISMATCH", "Target parent has a different type");
    }

    const descendants = (await Category.find({ path: oid }).session(s(session)).lean()) as Lean[];
    const deepest = descendants.reduce((m, d) => Math.max(m, d.level), cat.level);
    const newPrefix = newParent ? [...(newParent.path ?? []), newParent._id] : [];
    const newLevel = newPrefix.length + 1;
    if (newLevel + (deepest - cat.level) > maxDepth) throw unprocessable("CATEGORY_MAX_DEPTH", `Move would exceed the maximum depth of ${maxDepth}`);

    const oldPrefixLen = (cat.path ?? []).length;
    if (descendants.length) {
      // Descendants first, the moved node LAST: if a non-transactional run fails midway, parentId (truth) is still
      // the old value and `rebuildCategoryHierarchy()` restores consistency.
      await Category.bulkWrite(
        descendants.map((d) => {
          const rest = (d.path ?? []).slice(oldPrefixLen + 1);
          const path = [...newPrefix, oid, ...rest];
          return { updateOne: { filter: { _id: d._id }, update: { $set: { path, level: path.length + 1 } } } };
        }),
        { session },
      );
    }
    const sortOrder = opts.position !== undefined ? opts.position : await nextSortOrder(newParent ? newParent._id : null, session);
    const updated = await Category.findOneAndUpdate(
      { _id: oid },
      { $set: { parentId: newParent ? newParent._id : null, path: newPrefix, level: newLevel, sortOrder, ...(opts.actorId ? { updatedBy: toObjectId(opts.actorId) } : {}) } },
      { new: true, session },
    ).lean();
    return toCategoryDto(updated as Lean, "admin");
  });
}

/** Recovery tool: recompute `path`/`level` for every category from `parentId` (the source of truth). */
export async function rebuildCategoryHierarchy(): Promise<{ updated: number; orphans: string[] }> {
  await connectDB();
  const all = (await Category.find({}, { parentId: 1, path: 1, level: 1 }).lean()) as Lean[];
  const byId = new Map(all.map((c) => [String(c._id), c]));
  const ops: Parameters<typeof Category.bulkWrite>[0] = [];
  const orphans: string[] = [];
  const computed = new Map<string, { path: Types.ObjectId[]; level: number } | null>();
  const compute = (c: Lean, seen = new Set<string>()): { path: Types.ObjectId[]; level: number } | null => {
    const key = String(c._id);
    if (computed.has(key)) return computed.get(key)!;
    if (seen.has(key)) return null; // cycle
    seen.add(key);
    let r: { path: Types.ObjectId[]; level: number } | null;
    if (!c.parentId) r = { path: [], level: 1 };
    else {
      const p = byId.get(String(c.parentId));
      const pr = p ? compute(p, seen) : null;
      r = pr && p ? { path: [...pr.path, p._id], level: pr.level + 1 } : null;
    }
    computed.set(key, r);
    return r;
  };
  for (const c of all) {
    const r = compute(c);
    if (!r) { orphans.push(String(c._id)); continue; }
    const same = r.level === c.level && r.path.length === (c.path ?? []).length && r.path.every((x, i) => x.equals(c.path[i]!));
    if (!same) ops.push({ updateOne: { filter: { _id: c._id }, update: { $set: { path: r.path, level: r.level } } } });
  }
  if (ops.length) await Category.bulkWrite(ops);
  return { updated: ops.length, orphans };
}

export async function reorderCategories(parentId: string | null, orderedIds: string[]): Promise<void> {
  await connectDB();
  const ids = [...new Set(orderedIds)].map((x) => toObjectId(x));
  if (ids.length !== orderedIds.length) throw new AppError("VALIDATION_ERROR", 400, "Duplicate ids in order list");
  const pid = parentId ? toObjectId(parentId, "parentId") : null;
  const found = await Category.countDocuments({ _id: { $in: ids }, parentId: pid });
  if (found !== ids.length) throw unprocessable("CATEGORY_NOT_SIBLINGS", "All categories must be children of the given parent");
  await Category.bulkWrite(ids.map((_id, i) => ({ updateOne: { filter: { _id }, update: { $set: { sortOrder: (i + 1) * 10 } } } })));
}

// ---------------------------------------------------------------- status flags
async function setFlag(id: string, set: Record<string, unknown>, actor?: Actor): Promise<CategoryDto> {
  await connectDB();
  const upd = { ...set, ...(actor?.actorId ? { updatedBy: toObjectId(actor.actorId) } : {}) };
  const doc = await Category.findOneAndUpdate({ _id: toObjectId(id) }, { $set: upd }, { new: true }).lean();
  if (!doc) throw notFound("Category");
  return toCategoryDto(doc as Lean, "admin");
}
export const setCategoryVisibility = (id: string, isVisible: boolean, a?: Actor) => setFlag(id, { isVisible }, a);
export const setCategoryActiveStatus = (id: string, isActive: boolean, a?: Actor) => setFlag(id, { isActive }, a);

// ---------------------------------------------------------------- dependents / archive / delete
export async function countDependents(ids: Types.ObjectId[], session?: ClientSession): Promise<number> {
  const [pets, products] = await Promise.all([
    Pet.countDocuments({ categoryId: { $in: ids } }).session(s(session)),
    Product.countDocuments({ $or: [{ categoryId: { $in: ids } }, { subcategoryId: { $in: ids } }] }).session(s(session)),
  ]);
  return pets + products;
}

export async function archiveCategory(id: string, opts: Actor & { archiveDescendants?: boolean; reassignDependentsTo?: string } = {}): Promise<CategoryDto> {
  await connectDB();
  const oid = toObjectId(id);
  return withTransaction(async (session) => {
    const cat = (await Category.findById(oid).session(s(session)).lean()) as Lean | null;
    if (!cat) throw notFound("Category");
    if (cat.archivedAt) return toCategoryDto(cat, "admin"); // idempotent

    const descendants = (await Category.find({ path: oid }, { _id: 1 }).session(s(session)).lean()) as Pick<Lean, "_id">[];
    const ids = opts.archiveDescendants ? [oid, ...descendants.map((d) => d._id)] : [oid];
    if (!opts.archiveDescendants && (await Category.exists({ parentId: oid, archivedAt: null }))) {
      throw conflict("CATEGORY_HAS_CHILDREN", "Category has active children: archive them too (archiveDescendants) or move them first");
    }

    if ((await countDependents(ids, session)) > 0) {
      if (!opts.reassignDependentsTo) throw conflict("CATEGORY_HAS_DEPENDENTS", "Pets/products are assigned: provide reassignDependentsTo");
      const target = toObjectId(opts.reassignDependentsTo, "reassignDependentsTo");
      if (ids.some((x) => x.equals(target))) throw unprocessable("CATEGORY_REASSIGN_INVALID", "Reassignment target is being archived");
      const targetCat = (await Category.findById(target).session(s(session)).lean()) as Lean | null;
      if (!targetCat || targetCat.archivedAt || !targetCat.isActive) throw unprocessable("CATEGORY_REASSIGN_INVALID", "Reassignment target is unavailable");
      const petTypes = await Pet.distinct("type", { categoryId: { $in: ids } }).session(s(session));
      if (petTypes.some((t) => t !== targetCat.type)) throw unprocessable("CATEGORY_INCOMPATIBLE", "Reassignment target is incompatible with assigned pets");
      const productCount = await Product.countDocuments({ $or: [{ categoryId: { $in: ids } }, { subcategoryId: { $in: ids } }] }).session(s(session));
      if (productCount && targetCat.type !== "accessory") throw unprocessable("CATEGORY_INCOMPATIBLE", "Reassignment target is incompatible with assigned products");
      await Pet.updateMany({ categoryId: { $in: ids } }, { $set: { categoryId: target } }, { session });
      await Product.updateMany({ categoryId: { $in: ids } }, { $set: { categoryId: target } }, { session });
      await Product.updateMany({ subcategoryId: { $in: ids } }, { $set: { subcategoryId: target } }, { session });
    }
    await Category.updateMany({ _id: { $in: ids }, archivedAt: null }, { $set: { archivedAt: new Date(), ...(opts.actorId ? { updatedBy: toObjectId(opts.actorId) } : {}) } }, { session });
    return toCategoryDto((await Category.findById(oid).session(s(session)).lean()) as Lean, "admin");
  });
}

export async function restoreCategory(id: string, opts: Actor & { restoreDescendants?: boolean } = {}): Promise<CategoryDto> {
  await connectDB();
  const oid = toObjectId(id);
  const cat = (await Category.findById(oid).lean()) as Lean | null;
  if (!cat) throw notFound("Category");
  if (cat.path?.length && (await Category.exists({ _id: { $in: cat.path }, archivedAt: { $ne: null } }))) {
    throw conflict("CATEGORY_PARENT_ARCHIVED", "Restore the archived parent first");
  }
  await Category.updateOne({ _id: oid }, { $set: { archivedAt: null, ...(opts.actorId ? { updatedBy: toObjectId(opts.actorId) } : {}) } });
  if (opts.restoreDescendants) await Category.updateMany({ path: oid }, { $set: { archivedAt: null } });
  return toCategoryDto((await Category.findById(oid).lean()) as Lean, "admin");
}

/**
 * RETENTION POLICY: a category may be hard-deleted ONLY if it has no children, no assigned pets/products and has
 * never appeared in an order snapshot. Everything else must be archived. Nothing cascades.
 */
export async function deleteCategorySafely(id: string): Promise<{ deleted: true }> {
  await connectDB();
  const oid = toObjectId(id);
  if (!(await Category.exists({ _id: oid }))) throw notFound("Category");
  if (await Category.exists({ parentId: oid })) throw conflict("CATEGORY_HAS_CHILDREN", "Category has child categories");
  if ((await countDependents([oid])) > 0) throw conflict("CATEGORY_HAS_DEPENDENTS", "Pets or products are assigned to this category");
  if (await Order.exists({ "items.category.categoryId": oid })) throw conflict("CATEGORY_REFERENCED_BY_HISTORY", "Category appears in historical orders; archive it instead");
  await Category.deleteOne({ _id: oid });
  return { deleted: true };
}

// ---------------------------------------------------------------- reads
export async function getCategoryTree(opts: { scope?: Scope } = {}): Promise<CategoryNode[]> {
  await connectDB();
  const scope = opts.scope ?? "public";
  const rows = (await Category.find(scope === "public" ? PUBLIC_FILTER : {}).sort({ level: 1, sortOrder: 1, name: 1 }).lean()) as Lean[];
  const nodes = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  for (const r of rows) nodes.set(String(r._id), { ...toCategoryDto(r, scope), children: [] });
  for (const r of rows) {
    const node = nodes.get(String(r._id))!;
    if (!r.parentId) roots.push(node);
    else nodes.get(String(r.parentId))?.children.push(node); // parent missing (filtered) => subtree unreachable => excluded
  }
  return roots;
}

export async function getCategoryBySlug(slug: string, scope: Scope = "public"): Promise<{ category: CategoryDto; canonicalSlug: string; redirected: boolean } | null> {
  await connectDB();
  let cat = (await Category.findOne({ slug }).lean()) as Lean | null;
  let redirected = false;
  if (!cat) { cat = (await Category.findOne({ slugHistory: slug }).lean()) as Lean | null; redirected = !!cat; }
  if (!cat) return null;
  if (scope === "public" && !(await isChainPublic(cat))) return null;
  return { category: toCategoryDto(cat, scope), canonicalSlug: cat.slug, redirected };
}

export async function getCategoryChildren(parentId: string | null, scope: Scope = "public"): Promise<CategoryDto[]> {
  await connectDB();
  const pid = parentId ? toObjectId(parentId, "parentId") : null;
  if (pid && scope === "public") {
    const p = (await Category.findById(pid).lean()) as Lean | null;
    if (!p || !(await isChainPublic(p))) return [];
  }
  const rows = (await Category.find({ parentId: pid, ...(scope === "public" ? PUBLIC_FILTER : {}) }).sort({ sortOrder: 1, name: 1 }).lean()) as Lean[];
  return rows.map((r) => toCategoryDto(r, scope));
}

/** Breadcrumb order: root first, ending with the category itself. */
export async function getCategoryAncestors(id: string, scope: Scope = "public"): Promise<CategoryDto[]> {
  await connectDB();
  const cat = (await Category.findById(toObjectId(id)).lean()) as Lean | null;
  if (!cat) throw notFound("Category");
  if (scope === "public" && !(await isChainPublic(cat))) throw notFound("Category");
  const ancestors = (await Category.find({ _id: { $in: cat.path ?? [] } }).sort({ level: 1 }).lean()) as Lean[];
  return [...ancestors, cat].map((c) => toCategoryDto(c, scope));
}

export async function getCategoryDescendants(id: string, scope: Scope = "public"): Promise<CategoryDto[]> {
  await connectDB();
  const oid = toObjectId(id);
  const cat = (await Category.findById(oid).lean()) as Lean | null;
  if (!cat) throw notFound("Category");
  const rows = (await Category.find({ path: oid }).sort({ level: 1, sortOrder: 1 }).lean()) as Lean[];
  if (scope === "admin") return rows.map((r) => toCategoryDto(r, "admin"));
  if (!(await isChainPublic(cat))) return [];
  const eligible = await getPublicCategoryIds();
  return rows.filter((r) => eligible.has(String(r._id))).map((r) => toCategoryDto(r, "public"));
}

/** Resolves a public category slug to [id, ...descendant ids], restricted to publicly eligible categories. */
export async function resolvePublicCategoryIds(slug: string): Promise<Types.ObjectId[] | null> {
  const found = await getCategoryBySlug(slug, "public");
  if (!found) return null;
  const desc = await getCategoryDescendants(found.category.id, "public");
  return [found.category.id, ...desc.map((d) => d.id)].map((x) => new Types.ObjectId(x));
}

export async function getCategoryByIdAdmin(id: string): Promise<CategoryDto> {
  await connectDB();
  const c = (await Category.findById(toObjectId(id)).lean()) as Lean | null;
  if (!c) throw notFound("Category");
  return toCategoryDto(c, "admin");
}

/** Admin flat list (includes hidden/inactive/archived), optionally filtered. */
export async function listCategoriesAdmin(opts: { includeArchived?: boolean; parentId?: string | null } = {}): Promise<CategoryDto[]> {
  await connectDB();
  const f: Record<string, unknown> = {};
  if (!opts.includeArchived) f.archivedAt = null;
  if (opts.parentId !== undefined) f.parentId = opts.parentId ? toObjectId(opts.parentId, "parentId") : null;
  const rows = (await Category.find(f).sort({ level: 1, sortOrder: 1, name: 1 }).lean()) as Lean[];
  return rows.map((r) => toCategoryDto(r, "admin"));
}
