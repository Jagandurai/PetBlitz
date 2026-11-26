"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import { LuArchive, LuFileCheck, LuFilePen, LuFiles, LuImage, LuPencil, LuPlus, LuTags } from "react-icons/lu";
import { Badge, Button, Confirm, Empty, ErrorBox, Modal, Pager, Select, Spinner, TextField, useDebounced } from "@/components/ui";
import { api, qs } from "@/lib/ui/api";
import { Can, useAdmin } from "@/lib/ui/admin";
import { day } from "@/lib/ui/format";
import { useAction, useApi } from "@/lib/ui/hooks";

interface Row { _id: string; title: string; slug: string; status: "draft" | "published" | "archived"; author?: string; category?: string; tags?: string[]; coverImage?: { url: string }; publishedAt?: string; updatedAt: string; isFeatured?: boolean }
interface Term { name: string; count: number }
interface Data { items: Row[]; total: number; totalPages: number; counts: { total: number; published: number; draft: number; archived: number }; categories: Term[]; tags: Term[] }

export default function AdminBlog() {
  const { can } = useAdmin();
  const [q, setQ] = useState(""), [status, setStatus] = useState(""), [category, setCategory] = useState(""), [page, setPage] = useState(1);
  const [doomed, setDoomed] = useState<Row | null>(null), [terms, setTerms] = useState(false);
  const typed = useDebounced(q.trim(), 250), dq = q.trim() ? typed : ""; // clearing the box takes effect at once
  const { data, loading, error, reload } = useApi<Data>(`/api/admin/blog${qs({ q: dq, status, category, page, pageSize: 15 })}`);
  const { busy, run } = useAction();
  const move = async (r: Row, to: Row["status"], message: string) => { if (await run(() => api(`/api/admin/blog/${r._id}`, { method: "PATCH", body: { status: to } }), message)) reload(); };
  const remove = async () => {
    if (!doomed) return;
    if (await run(() => api(`/api/admin/blog/${doomed._id}`, { method: "DELETE" }), "Article deleted")) { setDoomed(null); if (data?.items.length === 1 && page > 1) setPage(page - 1); else reload(); }
  };
  const filter = (v: string) => { setStatus(v); setPage(1); };
  const stats = [
    { key: "", label: "Total articles", value: data?.counts.total, icon: <LuFiles />, tone: "#0f766e" },
    { key: "published", label: "Published", value: data?.counts.published, icon: <LuFileCheck />, tone: "#15803d" },
    { key: "draft", label: "Drafts", value: data?.counts.draft, icon: <LuFilePen />, tone: "#b45309" },
    { key: "archived", label: "Archived", value: data?.counts.archived, icon: <LuArchive />, tone: "#64748b" },
  ];

  return (
    <div className="set pl">
      <div className="top"><div><h1>Blog</h1><p className="muted small" style={{ margin: 0 }}>Write, publish and organise articles for the storefront.</p></div>
        <div className="row"><Button className="ghost" onClick={() => setTerms(true)}><LuTags /> Categories &amp; tags</Button><Can perm="marketing.write"><Link className="btn" href="/admin/blog/new"><LuPlus /> New article</Link></Can></div></div>
      <div className="kpis" style={{ marginBottom: 0 }}>{stats.map((s) => <button key={s.label} type="button" className={`kpi blg-kpi ${status === s.key ? "on" : ""}`} aria-pressed={status === s.key} onClick={() => filter(s.key)}><span className="kpi-ic" style={{ color: s.tone, background: `${s.tone}1a` }}>{s.icon}</span><span><span className="kpi-l">{s.label}</span><b className="kpi-v">{s.value ?? "—"}</b></span></button>)}</div>
      <div className="set-card pl-filter">
        <div className="grow"><TextField label="Search" type="search" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Title, slug, author or tag" maxLength={100} /></div>
        <Select label="Status" value={status} onChange={filter} options={[{ value: "", label: "All" }, { value: "published", label: "Published" }, { value: "draft", label: "Draft" }, { value: "archived", label: "Archived" }]} />
        <Select label="Category" value={category} onChange={(v) => { setCategory(v); setPage(1); }} options={[{ value: "", label: "All" }, ...(data?.categories ?? []).map((c) => ({ value: c.name, label: c.name }))]} />
      </div>
      {error ? <ErrorBox msg={error} retry={reload} /> : loading && !data ? <Spinner /> : !data?.items.length ? <Empty>{dq || status || category ? "No articles match these filters." : "No articles yet. Create your first one."}</Empty> : (
        <div className="set-card pl-tbl tw"><table className="t"><thead><tr><th>Article</th><th>Category</th><th>Status</th><th>Date</th><th className="right">Actions</th></tr></thead><tbody>
          {data.items.map((r) => (
            <tr key={r._id}>
              <td style={{ minWidth: 260 }}><Link className="pl-name" href={`/admin/blog/${r._id}`}>{r.coverImage?.url ? <img src={r.coverImage.url} alt="" /> : <span className="pl-ph"><LuImage /></span>}<span><strong>{r.title}</strong><small>/{r.slug}{r.author ? ` · ${r.author}` : ""}{r.isFeatured ? " · ★ Featured" : ""}</small></span></Link></td>
              <td>{r.category || "—"}</td>
              <td><Badge status={r.status} /></td>
              <td className="nowrap small">{r.status === "published" ? `Published ${day(r.publishedAt)}` : `Updated ${day(r.updatedAt)}`}</td>
              <td className="right"><div className="rt-act">
                <Link className="btn ghost sm" href={`/admin/blog/${r._id}`}><LuPencil /> {can("marketing.write") ? "Edit" : "Open"}</Link>
                <Link className="btn ghost sm" href={`/admin/blog/${r._id}?preview=1`}>Preview</Link>
                <Can perm="marketing.write">
                  {r.status === "published" ? <Button className="ghost sm" busy={busy} onClick={() => move(r, "draft", "Unpublished: saved as draft")}>Unpublish</Button>
                    : r.status === "draft" ? <Button className="ghost sm" busy={busy} onClick={() => move(r, "published", "Article published")}>Publish</Button>
                    : <Button className="ghost sm" busy={busy} onClick={() => move(r, "draft", "Restored as draft")}>Restore</Button>}
                  {r.status !== "archived" && <Button className="ghost sm" busy={busy} onClick={() => move(r, "archived", "Article archived")}>Archive</Button>}
                  <Button className="ghost sm danger-text" onClick={() => setDoomed(r)}>Delete</Button>
                </Can>
              </div></td>
            </tr>))}
        </tbody></table></div>)}
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
      <Confirm open={!!doomed} onClose={() => setDoomed(null)} onConfirm={remove} danger busy={busy} title="Delete article?" confirmLabel="Delete permanently"><p>“{doomed?.title}” will be permanently deleted. To only hide it, archive it instead.</p></Confirm>
      {terms && data && <TermsModal data={data} onClose={() => setTerms(false)} onChange={() => { setCategory(""); reload(); }} />}
    </div>
  );
}

/** Categories and tags are created by using them on an article; here they are renamed (or merged) and removed everywhere. */
function TermsModal({ data, onClose, onChange }: { data: Data; onClose: () => void; onChange: () => void }) {
  const [edit, setEdit] = useState<{ kind: "category" | "tag"; from: string; to: string } | null>(null);
  const { busy, run } = useAction();
  const apply = async (kind: "category" | "tag", from: string, to: string | null) => {
    if (await run(() => api("/api/admin/blog/taxonomy", { method: "PATCH", body: { kind, from, to } }), to === null ? "Removed" : "Renamed")) { setEdit(null); onChange(); }
  };
  const group = (kind: "category" | "tag", title: string, list: Term[]) => (
    <section className="col" style={{ gap: 6 }}><h3>{title}</h3>
      {!list.length && <p className="muted small" style={{ margin: 0 }}>None yet.</p>}
      {list.map((t) => edit?.kind === kind && edit.from === t.name
        ? <form key={t.name} className="blg-term" onSubmit={(e) => { e.preventDefault(); if (edit.to.trim()) void apply(kind, t.name, edit.to.trim()); }}><input autoFocus aria-label={`New name for ${t.name}`} value={edit.to} maxLength={kind === "tag" ? 40 : 60} onChange={(e) => setEdit({ ...edit, to: e.target.value })} /><Button busy={busy} className="sm">Save</Button><button type="button" className="btn ghost sm" onClick={() => setEdit(null)}>Cancel</button></form>
        : <div key={t.name} className="blg-term"><span><b>{t.name}</b> <small className="muted">{t.count} article{t.count === 1 ? "" : "s"}</small></span><Can perm="marketing.write"><Button className="ghost sm" onClick={() => setEdit({ kind, from: t.name, to: t.name })}>Rename</Button><Button className="ghost sm danger-text" busy={busy} onClick={() => { if (window.confirm(`Remove “${t.name}” from all articles?`)) void apply(kind, t.name, null); }}>Remove</Button></Can></div>)}
    </section>
  );
  return <Modal open onClose={onClose} title="Blog categories & tags"><div className="col"><p className="muted small" style={{ margin: 0 }}>Add a category or tag by typing it on an article. Renaming to an existing name merges them.</p>{group("category", "Categories", data.categories)}{group("tag", "Tags", data.tags)}</div></Modal>;
}
