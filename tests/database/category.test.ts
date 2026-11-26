import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanDb, HAS_DB, makeCats, setupDb, teardownDb } from "../helpers";
import * as C from "@/services/category.service";
import { Category } from "@/models/Category";
import { Product } from "@/models/Product";

describe.skipIf(!HAS_DB)("category hierarchy (needs MONGODB_TEST_URI)", () => {
  beforeAll(setupDb, 30000);
  beforeEach(cleanDb, 30000);
  afterAll(teardownDb);

  it("creates root, child, grandchild and brand-new names", async () => {
    const { grooming: dogs, brushes: lab } = await makeCats();
    const pup = await C.createCategory({ name: "Lab Puppies", parentId: lab.id });
    expect(pup.level).toBe(3);
    expect(pup.path).toEqual([dogs.id, lab.id]);
    const novel = await C.createCategory({ name: "Aquarium Fish Supplies", type: "accessory" });
    expect(novel.slug).toBe("aquarium-fish-supplies");
  });

  it("rejects excessive depth, self-parenting, cycles, bad parents, duplicate slugs", async () => {
    const { grooming: dogs, brushes: lab } = await makeCats();
    const g = await C.createCategory({ name: "G", parentId: lab.id });
    await expect(C.createCategory({ name: "Too deep", parentId: g.id })).rejects.toMatchObject({ code: "CATEGORY_MAX_DEPTH" });
    await expect(C.moveCategory(dogs.id, dogs.id)).rejects.toMatchObject({ code: "CATEGORY_CYCLE" });
    await expect(C.moveCategory(dogs.id, g.id)).rejects.toMatchObject({ code: "CATEGORY_CYCLE" });
    await expect(C.createCategory({ name: "X", parentId: "507f1f77bcf86cd799439011" })).rejects.toMatchObject({ code: "CATEGORY_PARENT_INVALID" });
    await expect(C.createCategory({ name: "Grooming", type: "accessory" })).rejects.toMatchObject({ code: "CATEGORY_SLUG_TAKEN" });
  });

  it("moves a subtree and updates descendant paths and levels", async () => {
    const { grooming: dogs, brushes: lab } = await makeCats();
    const cats = await C.createCategory({ name: "Walking", type: "accessory" });
    const g = await C.createCategory({ name: "G", parentId: lab.id });
    await C.moveCategory(lab.id, cats.id);
    const moved = await Category.findById(g.id).lean();
    expect(moved!.level).toBe(3);
    expect(moved!.path.map(String)).toEqual([cats.id, lab.id]);
    await expect(C.moveCategory(lab.id, null)).resolves.toMatchObject({ level: 1 });
    expect((await Category.findById(g.id).lean())!.level).toBe(2);
    expect(dogs.id).toBeTruthy();
  });

  it("rejects type mismatch on move and rebuilds hierarchy from parentId", async () => {
    const { brushes: lab } = await makeCats();
    const legacy = await Category.create({ name: "Old", slug: "old", type: "dog", level: 1 });
    await expect(C.moveCategory(lab.id, String(legacy._id))).rejects.toMatchObject({ code: "CATEGORY_TYPE_MISMATCH" });
    await Category.updateOne({ _id: lab.id }, { $set: { level: 9, path: [] } }); // corrupt
    const r = await C.rebuildCategoryHierarchy();
    expect(r.updated).toBeGreaterThan(0);
    expect((await Category.findById(lab.id).lean())!.level).toBe(2);
  });

  it("renames keep old slug resolvable; reorder works", async () => {
    const { grooming: dogs, brushes: lab } = await makeCats();
    await C.updateCategory(lab.id, { slug: "brush-sets" });
    const found = await C.getCategoryBySlug("brushes", "admin");
    expect(found).toMatchObject({ redirected: true, canonicalSlug: "brush-sets" });
    const b = await C.createCategory({ name: "Beagle", parentId: dogs.id });
    await C.reorderCategories(dogs.id, [b.id, lab.id]);
    const kids = await C.getCategoryChildren(dogs.id, "admin");
    expect(kids.map((k) => k.name)).toEqual(["Beagle", "Brushes"]);
  });

  it("public APIs exclude hidden / inactive / archived categories and their subtrees", async () => {
    const { grooming: dogs, brushes: lab, accessories } = await makeCats();
    const names = async () => (await C.getCategoryTree({ scope: "public" })).flatMap((n) => [n.name, ...n.children.map((c) => c.name)]);
    expect(await names()).toContain("Brushes");
    await C.setCategoryVisibility(dogs.id, false);
    expect(await names()).not.toContain("Grooming");
    expect(await names()).not.toContain("Brushes"); // subtree hidden implicitly, child flags untouched
    expect((await Category.findById(lab.id).lean())!.isVisible).toBe(true);
    await C.setCategoryVisibility(dogs.id, true);
    await C.setCategoryActiveStatus(lab.id, false);
    expect(await names()).not.toContain("Brushes");
    await C.archiveCategory(accessories.id, { archiveDescendants: true });
    expect(await names()).not.toContain("Accessories");
    expect(await C.getCategoryBySlug("accessories", "public")).toBeNull();
    await C.restoreCategory(accessories.id, { restoreDescendants: true });
    expect(await names()).toContain("Accessories");
  });

  it("validates assignment compatibility; legacy non-accessory categories are hidden and unassignable, and deletable only when unused", async () => {
    const { toys } = await makeCats();
    await expect(C.validateCategoryAssignment(toys.id)).resolves.toBeTruthy();
    const legacy = await Category.create({ name: "Old", slug: "old", type: "dog", level: 1 });
    const id = String(legacy._id);
    await expect(C.validateCategoryAssignment(id)).rejects.toMatchObject({ code: "CATEGORY_INCOMPATIBLE" });
    await expect(C.createCategory({ name: "Child", parentId: id })).rejects.toMatchObject({ code: "CATEGORY_PARENT_INVALID" });
    expect((await C.getCategoryTree({ scope: "public" })).map((n) => n.name)).not.toContain("Old");
    expect(await C.getCategoryBySlug("old", "public")).toBeNull();
    await expect(C.archiveCategory(id)).resolves.toBeTruthy();
    await expect(C.deleteCategorySafely(id)).resolves.toMatchObject({ count: 1 }); // unused, so it can go
  });

  it("blocks unsafe archive/delete with children or dependents; never cascades", async () => {
    const { grooming, toys } = await makeCats();
    await expect(C.deleteCategorySafely(grooming.id)).rejects.toMatchObject({ code: "CATEGORY_HAS_CHILDREN" });
    await expect(C.archiveCategory(grooming.id)).rejects.toMatchObject({ code: "CATEGORY_HAS_CHILDREN" });
    await Product.create({ name: "Ball", slug: "ball", sku: "BALL", categoryId: toys.id, compatibility: ["dog"], price: 100 });
    await expect(C.archiveCategory(toys.id)).rejects.toMatchObject({ code: "CATEGORY_HAS_DEPENDENTS" });
    const other = await C.createCategory({ name: "Leashes", parentId: (await Category.findById(toys.id).lean())!.parentId!.toString() });
    await C.archiveCategory(toys.id, { reassignDependentsTo: other.id });
    expect((await Product.findOne({ sku: "BALL" }).lean())!.categoryId.toString()).toBe(other.id); // reassigned, not deleted
  });

  it("deletes a whole subtree when asked and keeps its products, hidden", async () => {
    const { accessories, toys } = await makeCats();
    await Product.create({ name: "Ball", slug: "ball", sku: "BALL", categoryId: toys.id, compatibility: ["dog"], price: 100 });
    await expect(C.deleteCategorySafely(accessories.id, { includeChildren: true })).resolves.toMatchObject({ count: 2, unassignedProducts: 1 });
    expect(await Category.countDocuments({ _id: { $in: [accessories.id, toys.id] } })).toBe(0);
    expect((await Product.findOne({ sku: "BALL" }).lean())!.categoryId.toString()).toBe(toys.id); // untouched
    expect((await C.getPublicCategoryIds()).has(toys.id)).toBe(false);
  });

  it("can archive and keep products, then restore the whole subtree", async () => {
    const { accessories, toys } = await makeCats();
    await Product.create({ name: "Ball", slug: "ball", sku: "BALL", categoryId: toys.id, compatibility: ["dog"], price: 100 });
    await expect(C.archiveCategory(accessories.id, { archiveDescendants: true })).rejects.toMatchObject({ code: "CATEGORY_HAS_DEPENDENTS" });
    await C.archiveCategory(accessories.id, { archiveDescendants: true, keepProducts: true });
    expect((await Product.findOne({ sku: "BALL" }).lean())!.categoryId.toString()).toBe(toys.id); // not moved
    expect((await C.getPublicCategoryIds()).has(toys.id)).toBe(false);
    await C.restoreCategory(accessories.id, { restoreDescendants: true });
    expect((await C.getPublicCategoryIds()).has(toys.id)).toBe(true);
  });

  it("seeding semantics: seedKey is unique and edits are preserved", async () => {
    const a = await C.createCategory({ name: "Dogs", type: "accessory" }, { seedKey: "dogs" });
    await C.updateCategory(a.id, { name: "Canines" });
    await expect(C.createCategory({ name: "Dogs again", slug: "dogs-again", type: "accessory" }, { seedKey: "dogs" })).rejects.toBeTruthy();
    expect((await Category.findOne({ seedKey: "dogs" }).lean())!.name).toBe("Canines");
  });
});
