import { z } from "zod";
import { RichNode, isSafeHref, isSafeImageSrc } from "@/lib/blog-content";
import { imageInput, pagination, slug } from "./common";

const MAX_DEPTH = 8;
const MAX_NODES = 5000;

const mark = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }),
  z.object({ type: z.literal("italic") }),
  z.object({ type: z.literal("link"), attrs: z.object({ href: z.string().max(2048).refine(isSafeHref, "unsafe link") }) }),
]);

/** Allowed children per node type. Anything else is rejected; unknown attributes are dropped. */
const BLOCKS = ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "image", "horizontalRule"];
const CHILDREN: Record<string, string[]> = {
  doc: BLOCKS, blockquote: BLOCKS, listItem: BLOCKS, bulletList: ["listItem"], orderedList: ["listItem"],
  paragraph: ["text", "hardBreak"], heading: ["text", "hardBreak"],
};

const rawNode = z.object({ type: z.string(), text: z.string().max(20000).optional(), attrs: z.record(z.unknown()).optional(), marks: z.array(z.unknown()).max(5).optional(), content: z.array(z.unknown()).optional() });

function clean(raw: unknown, allowed: string[], depth: number, count: { n: number }): RichNode {
  if (depth > MAX_DEPTH || ++count.n > MAX_NODES) throw new Error("article is too deeply nested or too large");
  const base = rawNode.parse(raw);
  if (!allowed.includes(base.type)) throw new Error(`"${base.type.slice(0, 40)}" is not allowed here`);
  if (base.type === "text") {
    if (!base.text) throw new Error("empty text node");
    const marks = (base.marks ?? []).map((m) => mark.parse(m));
    return { type: "text", text: base.text, ...(marks.length ? { marks } : {}) };
  }
  const node: RichNode = { type: base.type };
  if (base.type === "heading") node.attrs = { level: z.number().int().min(2).max(4).parse(base.attrs?.level) }; // h1 is the article title
  if (base.type === "orderedList") node.attrs = { start: z.number().int().min(1).max(10000).catch(1).parse(base.attrs?.start) };
  if (base.type === "image") node.attrs = { src: z.string().max(2048).refine(isSafeImageSrc, "images must use https").parse(base.attrs?.src), alt: z.string().max(200).catch("").parse(base.attrs?.alt) };
  const kids = CHILDREN[base.type];
  if (kids && base.content) node.content = base.content.map((c) => clean(c, kids, depth + 1, count));
  return node;
}

export const richDoc = z.unknown().transform((raw, ctx): RichNode => {
  try { return clean(raw, ["doc"], 0, { n: 0 }); }
  catch (e) {
    ctx.addIssue({ code: "custom", message: e instanceof z.ZodError ? e.issues[0]?.message ?? "invalid content" : (e as Error).message });
    return z.NEVER;
  }
});

const label = z.string().trim().min(1).max(60);

const fields = z.object({
  title: z.string().trim().min(3).max(160),
  slug,
  excerpt: z.string().trim().max(400),
  coverImage: imageInput.nullable(),
  author: z.string().trim().max(80),
  category: z.string().trim().max(60),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(12).transform((t) => [...new Set(t)]),
  content: richDoc,
  isFeatured: z.boolean(),
  status: z.enum(["draft", "published", "archived"]),
  seoTitle: z.string().trim().max(120),
  seoDescription: z.string().trim().max(320),
});

export const updateBlogSchema = fields.partial().strict();
export const createBlogSchema = fields.partial().required({ title: true }).strict();

export const adminBlogQuery = pagination.extend({ status: z.enum(["draft", "published", "archived"]).optional(), category: label.optional(), q: z.string().trim().min(1).max(100).optional() }).strict();
export const publicBlogQuery = pagination.extend({ pageSize: z.coerce.number().int().min(1).max(24).default(9), category: label.optional(), tag: z.string().trim().min(1).max(40).optional(), q: z.string().trim().min(1).max(100).optional() }).strict();
/** Rename (or, with `to: null`, remove) a category or tag across all articles. */
export const taxonomySchema = z.object({ kind: z.enum(["category", "tag"]), from: label, to: label.nullable() }).strict();

export type CreateBlogInput = z.input<typeof createBlogSchema>;
export type UpdateBlogInput = z.input<typeof updateBlogSchema>;
