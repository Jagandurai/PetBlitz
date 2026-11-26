import { connectDB } from "@/lib/db/connection";
import { RichNode, hasBody, readingMinutes } from "@/lib/blog-content";
import { conflict, isDuplicateKeyError, notFound, unprocessable } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { escapeRegex, slugify } from "@/lib/sanitize";
import { Blog, BlogDoc } from "@/models/Blog";
import { CreateBlogInput, UpdateBlogInput, adminBlogQuery, createBlogSchema, publicBlogQuery, taxonomySchema, updateBlogSchema } from "@/validations/blog.validation";
import { pageMeta } from "@/validations/common";

/** The base of EVERY public query: drafts and archived articles are never returned. */
const PUBLIC = { status: "published" } as const;
const CARD_FIELDS = "title slug excerpt coverImage author category tags readingMinutes publishedAt";

export interface BlogCard { id: string; title: string; slug: string; excerpt: string; coverImage?: { url: string; alt?: string }; author: string; category: string; tags: string[]; readingMinutes: number; publishedAt?: string }
export interface BlogArticle extends BlogCard { content: RichNode; seoTitle?: string; seoDescription?: string; updatedAt: string }

function toCard(b: BlogDoc): BlogCard {
  return {
    id: String(b._id), title: b.title, slug: b.slug, excerpt: b.excerpt ?? "",
    coverImage: b.coverImage ? { url: b.coverImage.url, alt: b.coverImage.alt ?? undefined } : undefined, // storageKey stays private
    author: b.author ?? "", category: b.category ?? "", tags: [...(b.tags ?? [])], readingMinutes: b.readingMinutes ?? 1,
    publishedAt: b.publishedAt?.toISOString(),
  };
}

async function counted(field: "category" | "tags", match: Record<string, unknown>) {
  const rows = await Blog.aggregate<{ _id: string; count: number }>([
    { $match: match },
    ...(field === "tags" ? [{ $unwind: "$tags" }] : []),
    { $match: { [field]: { $type: "string", $ne: "" } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { _id: 1 as const } },
    { $limit: 200 },
  ]);
  return rows.map((r) => ({ name: r._id, count: r.count }));
}

const exact = (s: string) => new RegExp(`^${escapeRegex(s)}$`, "i");

// ---------------------------------------------------------------- public reads
export async function listPublicBlogs(raw: unknown) {
  await connectDB();
  const q = publicBlogQuery.parse(raw);
  const filter: Record<string, unknown> = { ...PUBLIC };
  if (q.category) filter.category = exact(q.category);
  if (q.tag) filter.tags = q.tag.toLowerCase();
  if (q.q) { const r = new RegExp(escapeRegex(q.q), "i"); filter.$or = [{ title: r }, { excerpt: r }, { tags: r }]; }
  // The featured article gets its own section on the unfiltered listing, so it is left out of the grid on every page.
  const browsing = !q.category && !q.tag && !q.q;
  const featured = browsing ? await Blog.findOne(PUBLIC).select(CARD_FIELDS).sort({ isFeatured: -1, publishedAt: -1 }).lean() : null;
  if (featured) filter._id = { $ne: featured._id };
  const [rows, total, categories] = await Promise.all([
    Blog.find(filter).select(CARD_FIELDS).sort({ publishedAt: -1, _id: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
    Blog.countDocuments(filter),
    counted("category", PUBLIC),
  ]);
  return { items: rows.map((r) => toCard(r as BlogDoc)), featured: featured && q.page === 1 ? toCard(featured as BlogDoc) : null, categories, ...pageMeta(q, total) };
}

export async function getPublicBlogBySlug(slug: string): Promise<{ post: BlogArticle; related: BlogCard[] }> {
  await connectDB();
  const b = (await Blog.findOne({ ...PUBLIC, slug }).lean()) as BlogDoc | null;
  if (!b) throw notFound("Article");
  const find = (f: Record<string, unknown>, n: number) => Blog.find({ ...f, ...PUBLIC }).select(CARD_FIELDS).sort({ publishedAt: -1 }).limit(n).lean();
  const or: Record<string, unknown>[] = [];
  if (b.category) or.push({ category: b.category });
  if (b.tags?.length) or.push({ tags: { $in: b.tags } });
  const related = or.length ? await find({ _id: { $ne: b._id }, $or: or }, 3) : [];
  if (related.length < 3) related.push(...(await find({ _id: { $nin: [b._id, ...related.map((r) => r._id)] } }, 3 - related.length)));
  return {
    post: { ...toCard(b), content: b.content as RichNode, seoTitle: b.seoTitle || undefined, seoDescription: b.seoDescription || undefined, updatedAt: b.updatedAt.toISOString() },
    related: related.map((r) => toCard(r as BlogDoc)),
  };
}

// ---------------------------------------------------------------- admin
export async function listBlogsAdmin(raw: unknown) {
  await connectDB();
  const q = adminBlogQuery.parse(raw);
  const f: Record<string, unknown> = {};
  if (q.status) f.status = q.status;
  if (q.category) f.category = exact(q.category);
  if (q.q) { const r = new RegExp(escapeRegex(q.q), "i"); f.$or = [{ title: r }, { slug: r }, { author: r }, { tags: r }]; }
  const [items, total, byStatus, categories, tags] = await Promise.all([
    Blog.find(f).select("-content").sort({ updatedAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
    Blog.countDocuments(f),
    Blog.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    counted("category", {}),
    counted("tags", {}),
  ]);
  const n = (s: string) => byStatus.find((x) => x._id === s)?.n ?? 0;
  const counts = { total: byStatus.reduce((a, x) => a + x.n, 0), published: n("published"), draft: n("draft"), archived: n("archived") };
  return { items, counts, categories, tags, ...pageMeta(q, total) };
}

export async function getBlogAdmin(id: string) {
  await connectDB();
  const b = await Blog.findById(toObjectId(id)).lean();
  if (!b) throw notFound("Article");
  return b;
}

/** An article can only be live when everything a reader sees is filled in. */
function assertPublishable(b: BlogDoc) {
  const missing = [
    !b.excerpt && "short description", !b.coverImage?.url && "cover image", !b.author && "author",
    !b.category && "category", !hasBody(b.content as RichNode) && "article content",
  ].filter(Boolean);
  if (missing.length) throw unprocessable("BLOG_INCOMPLETE", `Add the following before publishing: ${missing.join(", ")}`);
}

const slugTaken = async (slug: string, excludeId?: unknown) => !!(await Blog.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }));
const duplicate = () => conflict("BLOG_SLUG_TAKEN", "Another article already uses this URL slug");

export async function createBlog(input: CreateBlogInput, actorId?: string) {
  await connectDB();
  const d = createBlogSchema.parse(input);
  let slug = d.slug;
  if (slug) { if (await slugTaken(slug)) throw duplicate(); }
  else {
    // auto-generated from the title: add a numeric suffix until it is free
    const base = slugify(d.title) || "article";
    slug = base;
    for (let i = 2; await slugTaken(slug); i++) slug = `${base}-${i}`;
  }
  const doc = new Blog({ ...d, slug, coverImage: d.coverImage ?? undefined, readingMinutes: readingMinutes(d.content), createdBy: actorId ? toObjectId(actorId) : undefined });
  if (doc.status === "published") { assertPublishable(doc); doc.publishedAt = new Date(); }
  try { await doc.save(); } catch (e) { if (isDuplicateKeyError(e)) throw duplicate(); throw e; }
  return doc.toObject();
}

export async function updateBlog(id: string, patch: UpdateBlogInput, actorId?: string) {
  await connectDB();
  const d = updateBlogSchema.parse(patch);
  const doc = await Blog.findById(toObjectId(id));
  if (!doc) throw notFound("Article");
  if (d.slug && d.slug !== doc.slug && (await slugTaken(d.slug, doc._id))) throw duplicate();
  const { coverImage, content, ...rest } = d;
  doc.set(rest);
  if (coverImage !== undefined) doc.set("coverImage", coverImage ?? undefined);
  if (content !== undefined) { doc.set("content", content); doc.markModified("content"); doc.readingMinutes = readingMinutes(content); }
  if (actorId) doc.set("updatedBy", toObjectId(actorId));
  if (doc.status === "published") { assertPublishable(doc); doc.publishedAt ??= new Date(); } // edits to a live article must keep it complete
  try { await doc.save(); } catch (e) { if (isDuplicateKeyError(e)) throw duplicate(); throw e; }
  return doc.toObject();
}

export async function deleteBlog(id: string): Promise<{ deleted: true }> {
  await connectDB();
  if (!(await Blog.findByIdAndDelete(toObjectId(id)))) throw notFound("Article");
  return { deleted: true };
}

export async function updateTaxonomy(input: unknown) {
  await connectDB();
  const d = taxonomySchema.parse(input);
  if (d.kind === "category") {
    if (d.to === null && (await Blog.exists({ category: d.from, ...PUBLIC }))) throw conflict("CATEGORY_IN_USE", "Published articles use this category. Rename it, or move those articles first.");
    const r = await Blog.updateMany({ category: d.from }, { $set: { category: d.to ?? "" } });
    return { updated: r.modifiedCount };
  }
  const from = d.from.toLowerCase();
  const to = d.to?.toLowerCase().slice(0, 40);
  const ids = (await Blog.find({ tags: from }, { _id: 1 }).lean()).map((b) => b._id);
  if (to) await Blog.updateMany({ _id: { $in: ids } }, { $addToSet: { tags: to } });
  if (to !== from) await Blog.updateMany({ _id: { $in: ids } }, { $pull: { tags: from } });
  return { updated: ids.length };
}
