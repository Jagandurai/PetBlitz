import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanDb, HAS_DB, makeCats, setupDb, teardownDb } from "../helpers";
import * as C from "@/services/category.service";
import { Category } from "@/models/Category";
import { Pet } from "@/models/Pet";
import { Product } from "@/models/Product";

describe.skipIf(!HAS_DB)("category hierarchy (needs MONGODB_TEST_URI)", () => {
  beforeAll(setupDb, 30000);
  beforeEach(cleanDb, 30000);
  afterAll(teardownDb);

  it("creates root, child, grandchild and brand-new names", async () => {
    const { dogs, lab } = await makeCats();
    const pup = await C.createCategory({ name: "Lab Puppies", parentId: lab.id });
    expect(pup.level).toBe(3);
    expect(pup.path).toEqual([dogs.id, lab.id]);
    const novel = await C.createCategory({ name: "Aquarium Fish Supplies", type: "accessory" });
    expect(novel.slug).toBe("aquarium-fish-supplies");
  });

  it("rejects excessive depth, self-parenting, cycles, bad parents, duplicate slugs", async () => {
    const { dogs, lab } = await makeCats();
    const g = await C.createCategory({ name: "G", parentId: lab.id });
    await expect(C.createCategory({ name: "Too deep", parentId: g.id })).rejects.toMatchObject({ code: "CATEGORY_MAX_DEPTH" });
    await expect(C.moveCategory(dogs.id, dogs.id)).rejects.toMatchObject({ code: "CATEGORY_CYCLE" });
    await expect(C.moveCategory(dogs.id, g.id)).rejects.toMatchObject({ code: "CATEGORY_CYCLE" });
    await expect(C.createCategory({ name: "X", parentId: "507f1f77bcf86cd799439011" })).rejects.toMatchObject({ code: "CATEGORY_PARENT_INVALID" });
    await expect(C.createCategory({ name: "Dogs", type: "dog" })).rejects.toMatchObject({ code: "CATEGORY_SLUG_TAKEN" });
  });

  it("moves a subtree and updates descendant paths and levels", async () => {
    const { dogs, lab } = await makeCats();
    const cats = await C.createCategory({ name: "Cats", type: "dog" }); // same type root to allow the move
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
    const { lab, accessories } = await makeCats();
    await expect(C.moveCategory(lab.id, accessories.id)).rejects.toMatchObject({ code: "CATEGORY_TYPE_MISMATCH" });
    await Category.updateOne({ _id: lab.id }, { $set: { level: 9, path: [] } }); // corrupt
    const r = await C.rebuildCategoryHierarchy();
    expect(r.updated).toBeGreaterThan(0);
    expect((await Category.findById(lab.id).lean())!.level).toBe(2);
  });

  it("renames keep old slug resolvable; reorder works", async () => {
    const { dogs, lab } = await makeCats();
    await C.updateCategory(lab.id, { slug: "labrador-retriever" });
    const found = await C.getCategoryBySlug("labrador", "admin");
    expect(found).toMatchObject({ redirected: true, canonicalSlug: "labrador-retriever" });
    const b = await C.createCategory({ name: "Beagle", parentId: dogs.id });
    await C.reorderCategories(dogs.id, [b.id, lab.id]);
    const kids = await C.getCategoryChildren(dogs.id, "admin");
    expect(kids.map((k) => k.name)).toEqual(["Beagle", "Labrador"]);
  });

  it("public APIs exclude hidden / inactive / archived categories and their subtrees", async () => {
    const { dogs, lab, accessories } = await makeCats();
    const names = async () => (await C.getCategoryTree({ scope: "public" })).flatMap((n) => [n.name, ...n.children.map((c) => c.name)]);
    expect(await names()).toContain("Labrador");
    await C.setCategoryVisibility(dogs.id, false);
    expect(await names()).not.toContain("Dogs");
    expect(await names()).not.toContain("Labrador"); // subtree hidden implicitly, child flags untouched
    expect((await Category.findById(lab.id).lean())!.isVisible).toBe(true);
    await C.setCategoryVisibility(dogs.id, true);
    await C.setCategoryActiveStatus(lab.id, false);
    expect(await names()).not.toContain("Labrador");
    await C.archiveCategory(accessories.id, { archiveDescendants: true });
    expect(await names()).not.toContain("Accessories");
    expect(await C.getCategoryBySlug("accessories", "public")).toBeNull();
    await C.restoreCategory(accessories.id, { restoreDescendants: true });
    expect(await names()).toContain("Accessories");
  });

  it("validates assignment compatibility", async () => {
    const { lab, toys } = await makeCats();
    await expect(C.validateCategoryAssignment(lab.id, { entity: "pet", petType: "dog" })).resolves.toBeTruthy();
    await expect(C.validateCategoryAssignment(lab.id, { entity: "pet", petType: "cat" })).rejects.toMatchObject({ code: "CATEGORY_INCOMPATIBLE" });
    await expect(C.validateCategoryAssignment(lab.id, { entity: "product" })).rejects.toMatchObject({ code: "CATEGORY_INCOMPATIBLE" });
    await expect(C.validateCategoryAssignment(toys.id, { entity: "product" })).resolves.toBeTruthy();
  });

  it("blocks unsafe archive/delete with children or dependents; never cascades", async () => {
    const { dogs, lab, toys } = await makeCats();
    await expect(C.deleteCategorySafely(dogs.id)).rejects.toMatchObject({ code: "CATEGORY_HAS_CHILDREN" });
    await expect(C.archiveCategory(dogs.id)).rejects.toMatchObject({ code: "CATEGORY_HAS_CHILDREN" });
    await Product.create({ name: "Ball", slug: "ball", sku: "BALL", categoryId: toys.id, compatibility: ["dog"], price: 100 });
    await expect(C.deleteCategorySafely(toys.id)).rejects.toMatchObject({ code: "CATEGORY_HAS_DEPENDENTS" });
    await expect(C.archiveCategory(toys.id)).rejects.toMatchObject({ code: "CATEGORY_HAS_DEPENDENTS" });
    const other = await C.createCategory({ name: "Leashes", parentId: (await Category.findById(toys.id).lean())!.parentId!.toString() });
    await C.archiveCategory(toys.id, { reassignDependentsTo: other.id });
    expect((await Product.findOne({ sku: "BALL" }).lean())!.categoryId.toString()).toBe(other.id); // reassigned, not deleted
    await Pet.create({ name: "Rex", slug: "rex", petCode: "PET-1", type: "dog", categoryId: lab.id, price: 100 });
    await expect(C.deleteCategorySafely(lab.id)).rejects.toMatchObject({ code: "CATEGORY_HAS_DEPENDENTS" });
  });

  it("seeding semantics: seedKey is unique and edits are preserved", async () => {
    const a = await C.createCategory({ name: "Dogs", type: "dog" }, { seedKey: "dogs" });
    await C.updateCategory(a.id, { name: "Canines" });
    await expect(C.createCategory({ name: "Dogs again", slug: "dogs-again", type: "dog" }, { seedKey: "dogs" })).rejects.toBeTruthy();
    expect((await Category.findOne({ seedKey: "dogs" }).lean())!.name).toBe("Canines");
  });
});
