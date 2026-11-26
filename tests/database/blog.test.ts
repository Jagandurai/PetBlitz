import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanDb, HAS_DB, setupDb, teardownDb } from "../helpers";
import * as B from "@/services/blog.service";
import { Blog } from "@/models/Blog";

const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Pick the right size." }] }] };
const complete = (title: string, over: Record<string, unknown> = {}) => ({
  title, excerpt: "A short summary", author: "Asha", category: "Guides", tags: ["toys"], content: body,
  coverImage: { url: "https://cdn.example.com/c.jpg", storageKey: "private/key" }, ...over,
});

describe.skipIf(!HAS_DB)("blog CMS (PetBlitzTest)", () => {
  beforeAll(setupDb, 30000);
  beforeEach(cleanDb, 30000);
  afterAll(teardownDb);

  it("lifecycle: draft -> publish -> edit -> unpublish -> archive -> delete; only published is public", async () => {
    const draft = await B.createBlog(complete("How to pick a chew toy"));
    const id = String(draft._id);
    expect(draft).toMatchObject({ status: "draft", slug: "how-to-pick-a-chew-toy" });
    const hidden = async () => {
      await expect(B.getPublicBlogBySlug("how-to-pick-a-chew-toy")).rejects.toMatchObject({ code: "NOT_FOUND" });
      const list = await B.listPublicBlogs({});
      expect([list.items.length, list.featured, list.total, list.categories]).toEqual([0, null, 0, []]);
    };
    await hidden();

    const live = await B.updateBlog(id, { status: "published" });
    expect(live.publishedAt).toBeTruthy();
    const pub = await B.getPublicBlogBySlug("how-to-pick-a-chew-toy");
    expect(pub.post.title).toBe("How to pick a chew toy");
    expect(JSON.stringify(pub)).not.toMatch(/private\/key|createdBy/);
    await B.updateBlog(id, { title: "Choosing a chew toy" });
    expect((await B.getPublicBlogBySlug("how-to-pick-a-chew-toy")).post.title).toBe("Choosing a chew toy"); // slug is stable
    await expect(B.updateBlog(id, { excerpt: "" })).rejects.toMatchObject({ code: "BLOG_INCOMPLETE" }); // a live article stays complete

    await B.updateBlog(id, { status: "draft" });
    await hidden();
    await B.updateBlog(id, { status: "archived" });
    await hidden();
    expect((await B.listBlogsAdmin({})).counts).toEqual({ total: 1, published: 0, draft: 0, archived: 1 });
    const again = await B.updateBlog(id, { status: "published" });
    expect(again.publishedAt).toEqual(live.publishedAt); // first publication date is kept

    await B.deleteBlog(id);
    expect(await Blog.countDocuments()).toBe(0);
    await expect(B.deleteBlog(id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("incomplete articles cannot be published; slugs are unique", async () => {
    await expect(B.createBlog({ title: "Empty", status: "published" })).rejects.toMatchObject({ code: "BLOG_INCOMPLETE" });
    const a = await B.createBlog({ title: "Same title" });
    const b = await B.createBlog({ title: "Same title" });
    expect([a.slug, b.slug]).toEqual(["same-title", "same-title-2"]);
    await expect(B.createBlog({ title: "Other", slug: "same-title" })).rejects.toMatchObject({ code: "BLOG_SLUG_TAKEN" });
    await expect(B.updateBlog(String(b._id), { slug: "same-title" })).rejects.toMatchObject({ code: "BLOG_SLUG_TAKEN" });
  });

  it("public listing: featured, search, category and tag filters, pagination, related never include drafts", async () => {
    await B.createBlog(complete("Alpha", { status: "published", isFeatured: true }));
    for (const t of ["Bravo", "Charlie", "Delta"]) await B.createBlog(complete(t, { status: "published" }));
    await B.createBlog(complete("Secret draft"));
    await B.createBlog(complete("Old news", { status: "archived" }));

    const first = await B.listPublicBlogs({ pageSize: "2" });
    expect(first.featured!.title).toBe("Alpha");
    expect(first).toMatchObject({ total: 3, totalPages: 2, categories: [{ name: "Guides", count: 4 }] });
    const second = await B.listPublicBlogs({ pageSize: "2", page: "2" });
    expect([...first.items, ...second.items].map((i) => i.title).sort()).toEqual(["Bravo", "Charlie", "Delta"]);
    expect((await B.listPublicBlogs({ q: "secret" })).total).toBe(0);
    expect((await B.listPublicBlogs({ q: "a.b(c" })).total).toBe(0);
    expect((await B.listPublicBlogs({ category: "guides" })).total).toBe(4);
    expect((await B.listPublicBlogs({ tag: "TOYS" })).total).toBe(4);
    const related = (await B.getPublicBlogBySlug("bravo")).related.map((r) => r.title);
    expect(related).toHaveLength(3);
    for (const title of ["Secret draft", "Old news", "Bravo"]) expect(related).not.toContain(title);
  });

  it("categories and tags can be renamed, merged and removed", async () => {
    const live = await B.createBlog(complete("Live", { status: "published" }));
    await B.createBlog(complete("Draft", { category: "Care", tags: ["toys", "play"] }));
    await expect(B.updateTaxonomy({ kind: "category", from: "Guides", to: null })).rejects.toMatchObject({ code: "CATEGORY_IN_USE" });
    await B.updateTaxonomy({ kind: "category", from: "Guides", to: "Care" });
    expect((await B.listBlogsAdmin({})).categories).toEqual([{ name: "Care", count: 2 }]);
    await B.updateTaxonomy({ kind: "tag", from: "toys", to: "play" });
    expect((await B.listBlogsAdmin({})).tags).toEqual([{ name: "play", count: 2 }]);
    await B.updateTaxonomy({ kind: "tag", from: "play", to: null });
    expect((await Blog.findById(live._id).lean())!.tags).toEqual([]);
  });
});
