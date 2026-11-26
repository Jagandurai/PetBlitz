"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LuArrowLeft, LuExternalLink, LuEye, LuX } from "react-icons/lu";
import { ArticleBody } from "./article";
import RichEditor from "./editor";
import { Alert, Badge, Button, Check, Confirm, ErrorBox, Spinner, TextArea, TextField } from "@/components/ui";
import { RichNode, readingMinutes } from "@/lib/blog-content";
import { slugify } from "@/lib/sanitize";
import { api } from "@/lib/ui/api";
import { Can, useAdmin } from "@/lib/ui/admin";
import { useAction, useApi } from "@/lib/ui/hooks";
import ImageUploadField from "@/components/image-crop/image-upload-field";

type Status = "draft" | "published" | "archived";
interface Cover { url: string; alt?: string; storageKey?: string }
interface Rec { _id: string; title: string; slug: string; excerpt?: string; coverImage?: Cover; author?: string; category?: string; tags?: string[]; content?: RichNode; isFeatured?: boolean; status: Status; publishedAt?: string; seoTitle?: string; seoDescription?: string }
const empty = { title: "", slug: "", excerpt: "", cover: null as Cover | null, author: "", category: "", tags: [] as string[], content: { type: "doc", content: [] } as RichNode, isFeatured: false, seoTitle: "", seoDescription: "" };
type Form = typeof empty;

const toForm = (r: Rec): Form => ({
  title: r.title, slug: r.slug, excerpt: r.excerpt ?? "", cover: r.coverImage ? { url: r.coverImage.url, alt: r.coverImage.alt, storageKey: r.coverImage.storageKey } : null,
  author: r.author ?? "", category: r.category ?? "", tags: r.tags ?? [], content: r.content ?? empty.content, isFeatured: !!r.isFeatured, seoTitle: r.seoTitle ?? "", seoDescription: r.seoDescription ?? "",
});

/** Loads the article (when editing) before mounting the form, so the editor starts with the saved content. */
export default function BlogEditorPage({ id }: { id?: string }) {
  const rec = useApi<Rec>(id ? `/api/admin/blog/${id}` : null);
  if (id && rec.error) return <ErrorBox msg={rec.error} retry={rec.reload} />;
  if (id && !rec.data) return <Spinner />;
  return <BlogForm initial={rec.data} />;
}

function BlogForm({ initial }: { initial: Rec | null }) {
  const router = useRouter();
  const { can } = useAdmin();
  const { busy, run } = useAction();
  const options = useApi<{ categories: { name: string }[]; tags: { name: string }[] }>("/api/admin/blog?pageSize=1");
  const [saved, setSaved] = useState<Rec | null>(initial);
  const [f, setF] = useState<Form>(() => (initial ? toForm(initial) : empty));
  const [slugEdited, setSlugEdited] = useState(!!initial);
  const [dirty, setDirty] = useState(false);
  const [tag, setTag] = useState(""), [preview, setPreview] = useState(false), [confirmDelete, setConfirmDelete] = useState(false), [coverUrl, setCoverUrl] = useState("");
  const version = useRef(0);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { version.current++; setDirty(true); setF((x) => ({ ...x, [k]: v })); };
  const status: Status = saved?.status ?? "draft";
  const slug = slugEdited ? f.slug : slugify(f.title);
  const writable = can("marketing.write");

  useEffect(() => { // list "Preview" action links here with ?preview=1
    if (new URLSearchParams(window.location.search).get("preview")) setPreview(true);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { if (!preview) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setPreview(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [preview]);

  const addTags = (raw: string) => {
    const next = [...new Set([...f.tags, ...raw.split(",").map((t) => t.trim().toLowerCase().slice(0, 40)).filter(Boolean)])].slice(0, 12);
    set("tags", next); setTag("");
  };
  const save = async (next: Status, message: string) => {
    const tags = tag.trim() ? [...new Set([...f.tags, tag.trim().toLowerCase().slice(0, 40)])].slice(0, 12) : f.tags;
    const body = {
      title: f.title, ...(slugEdited && f.slug ? { slug: slugify(f.slug) || f.slug } : {}), excerpt: f.excerpt, author: f.author, category: f.category.trim(), tags,
      coverImage: f.cover ? { url: f.cover.url, alt: f.cover.alt || undefined, storageKey: f.cover.storageKey || undefined } : null,
      content: f.content, isFeatured: f.isFeatured, seoTitle: f.seoTitle, seoDescription: f.seoDescription, status: next,
    };
    const sentAt = version.current;
    const r = await run(() => api<Rec>(saved ? `/api/admin/blog/${saved._id}` : "/api/admin/blog", { method: saved ? "PATCH" : "POST", body }), message);
    if (!r) return;
    setSaved(r); setTag(""); setSlugEdited(true);
    // keep anything typed while the request was running
    if (version.current === sentAt) { setF((x) => ({ ...toForm(r), content: x.content })); setDirty(false); }
    if (!saved) router.replace(`/admin/blog/${r._id}`);
  };
  const remove = async () => {
    if (!saved) return;
    if (await run(() => api(`/api/admin/blog/${saved._id}`, { method: "DELETE" }), "Article deleted")) { setDirty(false); router.replace("/admin/blog"); }
  };
  const can3 = f.title.trim().length >= 3;

  return (
    <div className="set blg">
      <div className="top">
        <div>
          <Link href="/admin/blog" className="blg-back" onClick={(e) => { if (dirty && !window.confirm("Leave without saving your changes?")) e.preventDefault(); }}><LuArrowLeft /> All articles</Link>
          <h1>{saved ? "Edit article" : "New article"}</h1>
          <div className="row"><Badge status={status} /><span className="muted small">{dirty ? "Unsaved changes" : saved ? "All changes saved" : "Not saved yet"} · {readingMinutes(f.content)} min read</span></div>
        </div>
        <div className="row">
          <Button className="ghost" onClick={() => setPreview(true)}><LuEye /> Preview</Button>
          {saved && status === "published" && <a className="btn ghost" href={`/blog/${saved.slug}`} target="_blank" rel="noopener noreferrer"><LuExternalLink /> View live</a>}
        </div>
      </div>
      {!writable && <Alert kind="info">You have read-only access to the blog.</Alert>}
      <div className="blg-cols">
        <div className="blg-main">
          <section className="set-card">
            <TextField label="Title" value={f.title} onChange={(v) => set("title", v)} maxLength={160} required placeholder="A clear, specific headline" />
            <label className="f">URL slug<span className="hint">/blog/{slug || "…"}{status === "published" ? " — changing it breaks links that were already shared" : ""}</span>
              <input value={slug} maxLength={140} onChange={(e) => { setSlugEdited(true); set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-")); }} onBlur={() => { if (slugEdited) { const clean = slugify(f.slug); if (clean !== f.slug) set("slug", clean); if (!clean) setSlugEdited(false); } }} />
            </label>
            <TextArea label="Short description" hint={`Shown on cards and in search results · ${f.excerpt.length}/400`} value={f.excerpt} onChange={(v) => set("excerpt", v)} maxLength={400} rows={3} />
          </section>
          <section className="set-card blg-content">
            <h2>Article content</h2>
            <RichEditor initial={f.content} onChange={(doc) => set("content", doc)} />
          </section>
          <section className="set-card">
            <h2>Search engine listing</h2>
            <TextField label="SEO title" hint={`Falls back to the article title · ${f.seoTitle.length}/120`} value={f.seoTitle} onChange={(v) => set("seoTitle", v)} maxLength={120} />
            <TextArea label="SEO description" hint={`Falls back to the short description · ${f.seoDescription.length}/320`} value={f.seoDescription} onChange={(v) => set("seoDescription", v)} maxLength={320} rows={3} />
            <div className="blg-serp" aria-label="Search result preview"><b>{f.seoTitle || f.title || "Article title"}</b><span>petblitz.in › blog › {slug || "…"}</span><p>{(f.seoDescription || f.excerpt || "Your description will appear here.").slice(0, 160)}</p></div>
          </section>
        </div>
        <aside className="blg-side">
          <section className="set-card">
            <h2>Cover image</h2>
            <ImageUploadField label="Cover image" preset="BLOG_COVER" folder="blog" value={f.cover?.url} disabled={!writable} onChange={(up) => set("cover", { ...up, alt: f.cover?.alt })} />
            {f.cover && <Button className="ghost sm" onClick={() => set("cover", null)}><LuX /> Remove cover image</Button>}
            <div className="row" style={{ flexWrap: "nowrap" }}><input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="…or paste an https:// link" aria-label="Cover image link" /><Button className="ghost sm" disabled={!/^https:\/\/\S+$/.test(coverUrl)} onClick={() => { set("cover", { url: coverUrl }); setCoverUrl(""); }}>Use</Button></div>
            {f.cover && <TextField label="Image description (alt text)" value={f.cover.alt ?? ""} onChange={(v) => set("cover", { ...f.cover!, alt: v })} maxLength={200} />}
          </section>
          <section className="set-card">
            <h2>Details</h2>
            <TextField label="Author" value={f.author} onChange={(v) => set("author", v)} maxLength={80} />
            <label className="f">Category<span className="hint">Pick one or type a new one</span><input list="blg-cats" value={f.category} maxLength={60} onChange={(e) => set("category", e.target.value)} /><datalist id="blg-cats">{options.data?.categories.map((c) => <option key={c.name} value={c.name} />)}</datalist></label>
            <label className="f">Tags<span className="hint">Press Enter or comma · up to 12</span><input list="blg-tags" value={tag} maxLength={40} onChange={(e) => (e.target.value.includes(",") ? addTags(e.target.value) : setTag(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTags(tag); } }} onBlur={() => tag.trim() && addTags(tag)} /><datalist id="blg-tags">{options.data?.tags.map((t) => <option key={t.name} value={t.name} />)}</datalist></label>
            {f.tags.length > 0 && <div className="blg-chips">{f.tags.map((t) => <button type="button" key={t} aria-label={`Remove tag ${t}`} onClick={() => set("tags", f.tags.filter((x) => x !== t))}>{t}<LuX size={13} /></button>)}</div>}
            <Check label="Feature at the top of the blog" checked={f.isFeatured} onChange={(v) => set("isFeatured", v)} />
          </section>
        </aside>
      </div>
      <Can perm="marketing.write">
        <div className="savebar">
          <div className="row">{saved && <Button className="ghost danger-text" onClick={() => setConfirmDelete(true)}>Delete</Button>}{saved && status !== "archived" && <Button className="ghost" busy={busy} disabled={!can3} onClick={() => save("archived", "Article archived")}>Archive</Button>}</div>
          <div className="row">
            {status === "published" ? <><Button className="ghost" busy={busy} disabled={!can3} onClick={() => save("draft", "Unpublished: saved as draft")}>Unpublish</Button><Button busy={busy} disabled={!can3} onClick={() => save("published", "Live article updated")}>Update live article</Button></>
              : <><Button className="ghost" busy={busy} disabled={!can3} onClick={() => save("draft", "Draft saved")}>{status === "archived" ? "Restore as draft" : "Save draft"}</Button><Button busy={busy} disabled={!can3} onClick={() => save("published", "Article published")}>Publish</Button></>}
          </div>
        </div>
      </Can>
      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove} danger busy={busy} title="Delete article?" confirmLabel="Delete permanently"><p>“{saved?.title}” will be permanently deleted. To only hide it, archive it instead.</p></Confirm>
      {preview && (
        <div className="blg-preview" role="dialog" aria-modal="true" aria-label="Article preview">
          <header><span><LuEye /> Preview — only you can see this{dirty ? " (includes unsaved changes)" : ""}</span><button className="btn sm ghost" autoFocus onClick={() => setPreview(false)}><LuX /> Close</button></header>
          <div className="blg-preview-body" onClickCapture={(e) => { if ((e.target as HTMLElement).closest("a")) e.preventDefault(); }}>
            <ArticleBody a={{ title: f.title || "Untitled article", excerpt: f.excerpt, category: f.category, author: f.author, publishedAt: saved?.publishedAt, readingMinutes: readingMinutes(f.content), coverImage: f.cover ?? undefined, tags: f.tags, content: f.content }} />
          </div>
        </div>
      )}
    </div>
  );
}
