import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichContent } from "@/components/blog/article";
import { RichNode, isSafeHref, readingMinutes } from "@/lib/blog-content";
import { can, permissionFor } from "@/lib/auth/rbac";
import { createBlogSchema, publicBlogQuery, richDoc, updateBlogSchema } from "@/validations/blog.validation";

const text = (t: string, marks?: unknown[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const doc = (...content: unknown[]) => ({ type: "doc", content });
const para = (...content: unknown[]) => ({ type: "paragraph", content });
const link = (href: string) => doc(para(text("x", [{ type: "link", attrs: { href } }])));

describe("blog rich-text validation", () => {
  it("accepts every supported element, including what the editor emits, and drops unknown attributes", () => {
    const out = richDoc.parse(doc(
      { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
      para(text("b", [{ type: "bold" }]), text("i", [{ type: "italic" }]), { type: "hardBreak" }, text("l", [{ type: "link", attrs: { href: "https://example.com", target: "_blank", onclick: "x()" } }])),
      { type: "bulletList", content: [{ type: "listItem", content: [para(text("one"))] }] },
      { type: "orderedList", attrs: { start: 1, type: null }, content: [{ type: "listItem", content: [para(text("two"))] }] },
      { type: "blockquote", content: [para(text("quote"))] },
      { type: "image", attrs: { src: "https://res.cloudinary.com/d/image/upload/v1/a.jpg", alt: null, title: null, width: null, onerror: "alert(1)" } },
      { type: "horizontalRule" }, { type: "paragraph" },
    ));
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/onclick|onerror|target|width/);
    expect(out.content).toHaveLength(8);
  });
  it("rejects unsupported nodes, raw HTML nodes, h1 and misplaced children", () => {
    for (const bad of [
      doc({ type: "script", content: [] }), doc({ type: "html", text: "<img>" }), doc({ type: "heading", attrs: { level: 1 }, content: [text("a")] }),
      doc({ type: "bulletList", content: [para(text("a"))] }), doc(text("bare")), { type: "paragraph" }, "<p>html</p>",
    ]) expect(richDoc.safeParse(bad).success).toBe(false);
  });
  it("rejects script, data and protocol-relative links and non-https images", () => {
    for (const href of ["javascript:alert(1)", "JavaScript:alert(1)", " javascript:alert(1)", "data:text/html,x", "vbscript:x", "//evil.example", "/\\evil.example"]) {
      expect(isSafeHref(href)).toBe(false);
      expect(richDoc.safeParse(link(href)).success).toBe(false);
    }
    for (const href of ["https://example.com/a", "mailto:a@b.co", "tel:+911234567890", "/products", "#top"]) expect(richDoc.safeParse(link(href)).success).toBe(true);
    for (const src of ["http://example.com/a.jpg", "data:image/png;base64,AAAA", "javascript:alert(1)"]) expect(richDoc.safeParse(doc({ type: "image", attrs: { src } })).success).toBe(false);
  });
  it("limits nesting depth", () => {
    let n: unknown = para(text("deep"));
    for (let i = 0; i < 20; i++) n = { type: "blockquote", content: [n] };
    expect(richDoc.safeParse(doc(n)).success).toBe(false);
  });
  it("renderer escapes text and refuses unsafe URLs even if bad data reached the database", () => {
    const dirty: RichNode = { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
      { type: "image", attrs: { src: "javascript:alert(1)" } }, { type: "iframe" },
    ] };
    const html = renderToStaticMarkup(React.createElement(RichContent, { doc: dirty }));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<script|javascript:|<iframe|<img|<a /);
  });
  it("reading time is at least one minute and grows with length", () => {
    expect(readingMinutes({ type: "doc" })).toBe(1);
    expect(readingMinutes(doc(para(text("word ".repeat(660)))) as RichNode)).toBe(3);
  });
});

describe("blog request schemas and permissions", () => {
  it("is strict: no unknown fields, valid slugs, bounded public queries, no status override", () => {
    expect(createBlogSchema.safeParse({ title: "Hello world" }).success).toBe(true);
    expect(createBlogSchema.safeParse({}).success).toBe(false);
    expect(updateBlogSchema.safeParse({ slug: "Not A Slug" }).success).toBe(false);
    expect(updateBlogSchema.safeParse({ publishedAt: "2020-01-01" }).success).toBe(false);
    expect(publicBlogQuery.safeParse({ status: "draft" }).success).toBe(false);
    expect(publicBlogQuery.safeParse({ pageSize: "500" }).success).toBe(false);
    expect(updateBlogSchema.parse({ tags: ["Toys", "toys"] }).tags).toEqual(["toys"]);
  });
  it("only owner and catalog roles can change the blog", () => {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const perm = permissionFor(method, "/api/admin/blog/507f1f77bcf86cd799439011");
      expect(perm).toBe("marketing.write");
      expect((["owner", "catalog", "orders", "finance", "support"] as const).filter((r) => can(r, perm))).toEqual(["owner", "catalog"]);
    }
    expect(permissionFor("GET", "/api/admin/blog")).toBe("catalog.read");
    expect(can("support", "catalog.read")).toBe(false);
  });
});
