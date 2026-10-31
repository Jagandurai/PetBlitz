"use client";
import { useState } from "react";
import { FiArchive, FiArrowDown, FiArrowUp, FiChevronDown, FiChevronRight, FiCornerUpRight, FiEdit2, FiEye, FiEyeOff, FiMoreHorizontal, FiPlus, FiPower, FiTrash2 } from "react-icons/fi";
import { Alert, Badge, Button, Check, Confirm, ErrorBox, Modal, Select, Spinner, TextArea, TextField } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { CatNode, Can, flattenCats, useAdmin } from "@/lib/ui/admin";
import { useAction, useApi } from "@/lib/ui/hooks";

type Dlg = { kind: "create"; parent: CatNode | null } | { kind: "edit"; c: CatNode } | { kind: "move"; c: CatNode } | { kind: "archive"; c: CatNode } | { kind: "delete"; c: CatNode } | null;

export default function Categories() {
  const { can } = useAdmin();
  const [archived, setArchived] = useState(false);
  const { data, loading, error, reload } = useApi<{ tree: CatNode[] }>("/api/admin/categories");
  const { busy, run } = useAction();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); // collapsed by default: only parents show
  const [menu, setMenu] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ name: "", type: "accessory", description: "", slug: "", parentId: "", reassign: "", descendants: false });
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error ?? "Failed"} retry={reload} />;
  const flat = flattenCats(data.tree);
  const act = async (fn: () => Promise<unknown>, msg: string) => { if (await run(fn, msg) !== undefined) { setDlg(null); reload(); } };
  const siblings = (c: CatNode) => (c.parentId ? flat.find((x) => x.id === c.parentId)?.children : data.tree) ?? [];
  const shift = (c: CatNode, d: -1 | 1) => { const s = siblings(c).filter((x) => !x.archivedAt); const i = s.findIndex((x) => x.id === c.id); const j = i + d; if (j < 0 || j >= s.length) return; const ids = s.map((x) => x.id); [ids[i], ids[j]] = [ids[j]!, ids[i]!]; return act(() => api("/api/admin/categories/reorder", { method: "POST", body: { parentId: c.parentId, orderedIds: ids } }), "Order saved"); };
  const open = (d: Dlg, patch: Partial<typeof f> = {}) => { setF({ name: "", type: "accessory", description: "", slug: "", parentId: "", reassign: "", descendants: false, ...patch }); setDlg(d); };
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const match = (c: CatNode): boolean => c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.children.some(match);
  const render = (nodes: CatNode[]) => (
    <ul>{nodes.filter((n) => (archived || !n.archivedAt) && (!q.trim() || match(n))).map((c) => {
      const kids = c.children.filter((k) => archived || !k.archivedAt);
      const isOpen = expanded.has(c.id) || (!!q.trim() && kids.length > 0);
      return (
      <li key={c.id}>
        <div className={`node ${!c.isVisible || !c.isActive || c.archivedAt ? "off" : ""}`}>
          {kids.length ? <button className="chev" aria-expanded={isOpen} aria-label={isOpen ? `Collapse ${c.name}` : `Expand ${c.name}`} onClick={() => toggle(c.id)}>{isOpen ? <FiChevronDown /> : <FiChevronRight />}</button> : <span className="chev dot" />}
          <strong className="nm" onClick={() => kids.length && toggle(c.id)}>{c.name}</strong><span className="muted small">/{c.slug} · {c.type}</span>
          {kids.length > 0 && <span className="badge info">{kids.length} sub</span>}
          {c.archivedAt ? <Badge status="archived" /> : <>{!c.isVisible && <Badge status="hidden" />}{!c.isActive && <Badge status="suspended" label="Inactive" />}</>}
          <Can perm="catalog.write"><span className="row" style={{ marginLeft: "auto", gap: 4 }}>
            {!c.archivedAt ? <>
              <Button className="ghost sm" aria-label="Move up" onClick={() => shift(c, -1)}><FiArrowUp /></Button><Button className="ghost sm" aria-label="Move down" onClick={() => shift(c, 1)}><FiArrowDown /></Button>
              <Button className="ghost sm" onClick={() => { open({ kind: "create", parent: c }); setExpanded((s) => new Set(s).add(c.id)); }}><FiPlus /> Child</Button>
              <Button className="ghost sm" onClick={() => open({ kind: "edit", c }, { name: c.name, description: c.description ?? "", slug: c.slug })}><FiEdit2 /> Edit</Button>
              <span className="menu-wrap">
                <Button className="ghost sm" aria-label="More actions" onClick={() => setMenu(menu === c.id ? null : c.id)}><FiMoreHorizontal /></Button>
                {menu === c.id && <div className="menu" onClick={() => setMenu(null)}>
                  <button onClick={() => open({ kind: "move", c }, { parentId: c.parentId ?? "" })}><FiCornerUpRight /> Move</button>
                  <button onClick={() => act(() => api(`/api/admin/categories/${c.id}/visibility`, { method: "PATCH", body: { isVisible: !c.isVisible } }), c.isVisible ? "Hidden" : "Visible")}>{c.isVisible ? <FiEyeOff /> : <FiEye />} {c.isVisible ? "Hide" : "Show"}</button>
                  <button onClick={() => act(() => api(`/api/admin/categories/${c.id}/active`, { method: "PATCH", body: { isActive: !c.isActive } }), c.isActive ? "Deactivated" : "Activated")}><FiPower /> {c.isActive ? "Deactivate" : "Activate"}</button>
                  <button onClick={() => open({ kind: "archive", c })}><FiArchive /> Archive</button>
                  <button className="danger" onClick={() => open({ kind: "delete", c })}><FiTrash2 /> Delete</button>
                </div>}
              </span>
            </> : <><Button className="ghost sm" onClick={() => act(() => api(`/api/admin/categories/${c.id}/restore`, { method: "POST", body: {} }), "Restored")}>Restore</Button><Button className="ghost sm" aria-label="Delete" onClick={() => open({ kind: "delete", c })}><FiTrash2 /></Button></>}
          </span></Can>
        </div>
        {isOpen && kids.length > 0 && render(c.children)}
      </li>); })}</ul>
  );
  const moveTargets = dlg?.kind === "move" ? flat.filter((x) => !x.archivedAt && x.type === dlg.c.type && x.id !== dlg.c.id && !flattenCats(dlg.c.children).some((d) => d.id === x.id)) : [];
  const reassignTargets = dlg?.kind === "archive" ? flat.filter((x) => !x.archivedAt && x.isActive && x.id !== dlg.c.id && !flattenCats(dlg.c.children).some((d) => d.id === x.id)) : [];
  return (
    <>
      <div className="top"><h1>Categories</h1><div className="row"><input className="cat-q" placeholder="Search categories…" value={q} onChange={(e) => setQ(e.target.value)} /><Button className="ghost sm" onClick={() => setExpanded(new Set(flat.filter((x) => x.children.length).map((x) => x.id)))}>Expand all</Button><Button className="ghost sm" onClick={() => setExpanded(new Set())}>Collapse all</Button><Check label="Show archived" checked={archived} onChange={setArchived} /></div></div>
      <div className="row between mb"><span className="muted small">{data.tree.length} top-level categories · click a row or its arrow to reveal sub-categories</span><Can perm="catalog.write"><Button onClick={() => open({ kind: "create", parent: null })}><FiPlus /> New root category</Button></Can></div>
      <Alert kind="info">Categories are fully dynamic. A category is visible to customers only if it <strong>and all its parents</strong> are active, visible and not archived. Maximum depth is configured on the server (default 3).</Alert>
      <div className="card tree mt">{data.tree.length ? render(data.tree) : <p className="muted">No categories yet.</p>}</div>
      {!can("catalog.write") && <p className="muted small mt">You have read-only access to categories.</p>}

      <Modal open={dlg?.kind === "create"} onClose={() => setDlg(null)} title={dlg?.kind === "create" && dlg.parent ? `New child of ${dlg.parent.name}` : "New root category"}><div className="col">
        <TextField label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} maxLength={80} />
        {dlg?.kind === "create" && !dlg.parent && <Select label="Type" hint="Decides which pets/products may be assigned" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[{ value: "dog", label: "Dog" }, { value: "cat", label: "Cat" }, { value: "accessory", label: "Accessory" }]} />}
        <TextField label="URL slug (optional)" value={f.slug} onChange={(v) => setF({ ...f, slug: v })} hint="Generated from the name when empty" />
        <TextArea label="Description" value={f.description} onChange={(v) => setF({ ...f, description: v })} maxLength={2000} />
        <Button busy={busy} disabled={!f.name.trim()} onClick={() => act(() => api("/api/admin/categories", { method: "POST", body: { name: f.name, ...(dlg?.kind === "create" && dlg.parent ? { parentId: dlg.parent.id } : { type: f.type }), slug: f.slug || undefined, description: f.description || undefined } }), "Category created")}>Create</Button></div></Modal>
      <Modal open={dlg?.kind === "edit"} onClose={() => setDlg(null)} title="Edit category"><div className="col">
        <TextField label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} /><TextField label="URL slug" value={f.slug} onChange={(v) => setF({ ...f, slug: v })} hint="Changing it keeps the old URL working (redirect)" /><TextArea label="Description" value={f.description} onChange={(v) => setF({ ...f, description: v })} />
        <Button busy={busy} onClick={() => dlg?.kind === "edit" && act(() => api(`/api/admin/categories/${dlg.c.id}`, { method: "PATCH", body: { name: f.name, slug: f.slug, description: f.description || null } }), "Saved")}>Save</Button></div></Modal>
      <Modal open={dlg?.kind === "move"} onClose={() => setDlg(null)} title={dlg?.kind === "move" ? `Move ${dlg.c.name}` : ""}><div className="col">
        <Select label="New parent" value={f.parentId} onChange={(v) => setF({ ...f, parentId: v })} options={[{ value: "", label: "— Top level —" }, ...moveTargets.map((x) => ({ value: x.id, label: x.label }))]} hint="Same-type categories only; depth limit and cycles are checked by the server" />
        <Button busy={busy} onClick={() => dlg?.kind === "move" && act(() => api(`/api/admin/categories/${dlg.c.id}/move`, { method: "POST", body: { parentId: f.parentId || null } }), "Moved")}>Move</Button></div></Modal>
      <Modal open={dlg?.kind === "archive"} onClose={() => setDlg(null)} title={dlg?.kind === "archive" ? `Archive ${dlg.c.name}` : ""}><div className="col">
        <p className="muted">Archived categories disappear from the storefront. Nothing is deleted.</p>
        {dlg?.kind === "archive" && dlg.c.children.some((x) => !x.archivedAt) && <Check label="Also archive all sub-categories" checked={f.descendants} onChange={(v) => setF({ ...f, descendants: v })} />}
        <Select label="Move existing pets/products to (if any)" value={f.reassign} onChange={(v) => setF({ ...f, reassign: v })} options={[{ value: "", label: "— none (archive fails if items exist) —" }, ...reassignTargets.map((x) => ({ value: x.id, label: x.label }))]} />
        <Button busy={busy} onClick={() => dlg?.kind === "archive" && act(() => api(`/api/admin/categories/${dlg.c.id}/archive`, { method: "POST", body: { archiveDescendants: f.descendants || undefined, reassignDependentsTo: f.reassign || undefined } }), "Archived")}>Archive</Button></div></Modal>
      <Confirm open={dlg?.kind === "delete"} onClose={() => setDlg(null)} danger busy={busy} title="Delete category?" confirmLabel="Delete" onConfirm={() => dlg?.kind === "delete" && act(() => api(`/api/admin/categories/${dlg.c.id}`, { method: "DELETE" }), "Deleted")}>
        <p>Permanent. Only possible if it has no sub-categories, no pets/products and never appeared in an order — otherwise archive it instead.</p></Confirm>
    </>
  );
}
