"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FiAlignLeft, FiBox, FiDollarSign, FiImage, FiInfo, FiPlus, FiTrash2 } from "react-icons/fi";
import { Alert, Badge, Button, Check, Empty, ErrorBox, Field, Pager, Select, Spinner, TextArea, TextField, useDebounced } from "./ui";
import { ApiError, api, errText, qs } from "@/lib/ui/api";
import { CatNode, Can, flattenCats } from "@/lib/ui/admin";
import { inr, minorToRupees, rupeesToMinor } from "@/lib/ui/format";
import { useAction, useApi, useToast } from "@/lib/ui/hooks";

interface MediaItem { kind: "image"; url: string; storageKey?: string; alt?: string; isPrimary?: boolean; sortOrder?: number }
interface Rec { _id: string; name: string; slug: string; status: string; price: number; finalPrice: number; sku?: string; stockQuantity?: number; reservedQuantity?: number; availableQuantity?: number; stockStatus?: string; media: MediaItem[]; categoryId: string; isFeatured?: boolean; [k: string]: unknown }

// ------------------------------------------------------------------ Cloudinary upload (signed by the server; secret never reaches the browser)
export function MediaField({ value, onChange }: { value: MediaItem[]; onChange: (v: MediaItem[]) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false), [url, setUrl] = useState("");
  const folder = "products";
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      let next = [...value];
      for (const file of Array.from(files).slice(0, 10 - value.length)) {
        const s = await api<{ uploadUrl: string; fields: Record<string, string | number> }>("/api/admin/media/sign", { method: "POST", body: { folder } });
        const fd = new FormData(); Object.entries(s.fields).forEach(([k, v]) => fd.append(k, String(v))); fd.append("file", file);
        const r = await fetch(s.uploadUrl, { method: "POST", body: fd }); const j = await r.json();
        if (!r.ok) throw new Error(j.error?.message ?? "Upload failed");
        next = [...next, { kind: "image", url: j.secure_url as string, storageKey: j.public_id as string, isPrimary: next.length === 0 }];
      }
      onChange(next);
    } catch (e) { toast(errText(e), "err"); } finally { setBusy(false); }
  };
  const setPrimary = (i: number) => onChange(value.map((m, j) => ({ ...m, isPrimary: i === j })));
  const remove = (i: number) => { const n = value.filter((_, j) => j !== i); if (n.length && !n.some((m) => m.isPrimary)) n[0] = { ...n[0]!, isPrimary: true }; onChange(n); };
  return (
    <div className="col"><strong>Images</strong>
      <div className="row">{value.map((m, i) => <div key={m.url} className="card col" style={{ width: 130, padding: 8 }}><img src={m.url} alt={m.alt || `Image ${i + 1}`} style={{ aspectRatio: "1", objectFit: "cover", borderRadius: 8 }} />{m.isPrimary ? <Badge status="ok" label="Primary" /> : <Button className="ghost sm" onClick={() => setPrimary(i)}>Make primary</Button>}<Button className="ghost sm" onClick={() => remove(i)}>Remove</Button></div>)}</div>
      <div className="row"><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || value.length >= 10} onChange={(e) => upload(e.target.files)} style={{ width: "auto" }} />{busy && <span className="muted small">Uploading…</span>}</div>
      <div className="row" style={{ alignItems: "flex-end" }}><div className="grow"><TextField label="…or paste an image URL" value={url} onChange={setUrl} placeholder="https://" /></div><Button className="ghost" disabled={!/^https?:\/\//.test(url)} onClick={() => { onChange([...value, { kind: "image", url, isPrimary: value.length === 0 }]); setUrl(""); }}>Add</Button></div>
    </div>
  );
}

// ------------------------------------------------------------------ create / edit form
const blank = { name: "", categoryId: "", subcategoryId: "", shortDescription: "", description: "", extra: [] as { shortDescription: string; description: string }[], specs: [] as { key: string; value: string }[], sku: "", brand: "", material: "", compat: ["dog"] as string[], price: "", discountType: "none", discountValue: "", taxPct: "0", hsn: "", isFeatured: false, isVisible: true, isNewArrival: false, isTopSelling: false, trackInventory: true, stock: "0", lowStock: "5", backorder: "deny", media: [] as MediaItem[] };

export function CatalogForm({ id }: { id?: string }) {
  const router = useRouter();
  const { data: cats } = useApi<{ tree: CatNode[] }>("/api/admin/categories");
  const rec = useApi<Rec>(id ? `/api/admin/products/${id}` : null);
  const [s, setS] = useState(blank);
  const [status, setStatus] = useState("draft");
  const { busy, run } = useAction();
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setS((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    const r = rec.data as (Rec & Record<string, any>) | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!r) return;
    setStatus(r.status);
    setS({ ...blank, name: r.name, categoryId: String(r.categoryId), subcategoryId: r.subcategoryId ? String(r.subcategoryId) : "", shortDescription: r.shortDescription ?? "", description: r.description ?? "", extra: (r.extraDescriptions ?? []).map((x: { shortDescription?: string; description?: string }) => ({ shortDescription: x.shortDescription ?? "", description: x.description ?? "" })), specs: (r.specifications ?? []).map((x: { key: string; value: string }) => ({ key: x.key, value: x.value })), sku: r.sku ?? "", brand: r.brand ?? "", material: r.material ?? "", compat: r.compatibility ?? ["dog"], price: minorToRupees(r.price), discountType: r.discountType ?? "none", discountValue: r.discountType === "fixed" ? minorToRupees(r.discountValue) : String(r.discountValue ?? ""), taxPct: String((r.taxRateBps ?? 0) / 100), hsn: r.hsnCode ?? "", isFeatured: !!r.isFeatured, isVisible: r.isVisible !== false, isNewArrival: !!r.isNewArrival, isTopSelling: !!r.isTopSelling, trackInventory: r.trackInventory !== false, stock: String(r.stockQuantity ?? 0), lowStock: String(r.lowStockThreshold ?? 5), backorder: r.backorderPolicy ?? "deny", media: (r.media ?? []).map((m: MediaItem) => ({ kind: "image" as const, url: m.url, storageKey: m.storageKey, alt: m.alt, isPrimary: m.isPrimary })) });
  }, [rec.data]);

  const catOptions = flattenCats(cats?.tree ?? []).filter((c) => !c.archivedAt && c.type === "accessory");
  const payload = () => {
    const opt = <T,>(v: T | "" | undefined) => (v === "" || v === undefined ? undefined : v);
    const disc = s.discountType === "none" ? { discountType: "none", discountValue: 0 } : { discountType: s.discountType, discountValue: s.discountType === "fixed" ? rupeesToMinor(s.discountValue || 0) : Number(s.discountValue || 0) };
    const extraDescriptions = s.extra.filter((x) => x.shortDescription.trim() || x.description.trim()).map((x) => ({ shortDescription: opt(x.shortDescription.trim()), description: opt(x.description) }));
    const common = { name: s.name, extraDescriptions, categoryId: s.categoryId, shortDescription: opt(s.shortDescription), description: opt(s.description), price: rupeesToMinor(s.price || 0), ...disc, taxRateBps: Math.round(Number(s.taxPct || 0) * 100), hsnCode: opt(s.hsn), isFeatured: s.isFeatured, isVisible: s.isVisible, media: s.media.map((m, i) => ({ kind: "image", url: m.url, storageKey: m.storageKey, alt: m.alt, isPrimary: !!m.isPrimary, sortOrder: i })) };
    return { ...common, specifications: s.specs.filter((x) => x.key.trim() && x.value.trim()).map((x) => ({ key: x.key.trim(), value: x.value.trim() })), sku: s.sku, subcategoryId: opt(s.subcategoryId), compatibility: s.compat, brand: opt(s.brand), material: opt(s.material), trackInventory: s.trackInventory, ...(id ? {} : { stockQuantity: Number(s.stock || 0) }), lowStockThreshold: Number(s.lowStock || 0), backorderPolicy: s.backorder, isNewArrival: s.isNewArrival, isTopSelling: s.isTopSelling };
  };
  const save = async () => {
    const r = await run(() => (id ? api<Rec>(`/api/admin/products/${id}`, { method: "PATCH", body: payload() }) : api<Rec>("/api/admin/products", { method: "POST", body: payload() })), "Saved");
    if (r && !id) router.replace(`/admin/products/${r._id}`); else if (r) rec.reload();
  };
  const publish = async (st: string) => { if (await run(() => api(`/api/admin/products/${id}/publication`, { method: "PATCH", body: { status: st } }), `Status: ${st}`)) rec.reload(); };
  if (id && rec.loading && !rec.data) return <Spinner />;
  if (id && rec.error) return <ErrorBox msg={rec.error} retry={rec.reload} />;
  return (
    <div className="set pf">
      <div className="top"><div><h1>{id ? "Edit product" : "New product"}</h1><p className="muted small" style={{ margin: 0 }}>Add the product details, pricing, stock and photos.</p></div><Link className="btn ghost sm" href="/admin/products">← Back to list</Link></div>
      {id && <div className="card row between"><div className="row"><Badge status={status} /><span className="muted small">Publishing validates description, price and a primary image.</span></div>
        <Can perm="catalog.write"><div className="row">{status !== "published" && <Button onClick={() => publish("published")} busy={busy}>Publish</Button>}{status === "published" && <Button className="ghost" onClick={() => publish("draft")} busy={busy}>Unpublish</Button>}{status !== "archived" && <Button className="ghost" onClick={() => publish("archived")} busy={busy}>Archive</Button>}</div></Can></div>}
      <div className="set-card"><div className="set-h"><span className="set-ic"><FiAlignLeft /></span><div><h2>Basics</h2><p>Name, category and how the listing reads to customers.</p></div></div>
        <div className="grid g2"><TextField label="Name" value={s.name} onChange={(v) => set("name", v)} required />
          <TextField label="SKU" value={s.sku} onChange={(v) => set("sku", v)} hint="Unique" />
          <Select label="Category" value={s.categoryId} onChange={(v) => set("categoryId", v)} options={[{ value: "", label: "— choose —" }, ...catOptions.map((c) => ({ value: c.id, label: c.label }))]} />
          <TextField label="Brand" value={s.brand} onChange={(v) => set("brand", v)} />
          <Select label="Sub-category (optional)" value={s.subcategoryId} onChange={(v) => set("subcategoryId", v)} options={[{ value: "", label: "—" }, ...catOptions.map((c) => ({ value: c.id, label: c.label }))]} />
        </div>
        <div className="pf-block">
          <div className="pf-blockh"><span>Description</span><button type="button" className="pf-add" title="Add another short description & description" aria-label="Add another short description and description" onClick={() => set("extra", [...s.extra, { shortDescription: "", description: "" }])}><FiPlus /></button></div>
          <TextField label="Short description" value={s.shortDescription} onChange={(v) => set("shortDescription", v)} maxLength={300} />
          <TextArea label="Description" value={s.description} onChange={(v) => set("description", v)} maxLength={5000} rows={6} />
        </div>
        {s.extra.map((x, i) => <div key={i} className="pf-block">
          <div className="pf-blockh"><span>Description {i + 2}</span><button type="button" className="pf-add pf-del" aria-label="Remove this description" onClick={() => set("extra", s.extra.filter((_, j) => j !== i))}><FiTrash2 /></button></div>
          <TextField label="Short description" value={x.shortDescription} onChange={(v) => set("extra", s.extra.map((y, j) => (j === i ? { ...y, shortDescription: v } : y)))} maxLength={300} />
          <TextArea label="Description" value={x.description} onChange={(v) => set("extra", s.extra.map((y, j) => (j === i ? { ...y, description: v } : y)))} maxLength={5000} rows={5} />
        </div>)}
        <div className="row"><strong>Suitable for:</strong>{["dog", "cat"].map((p) => <Check key={p} label={p} checked={s.compat.includes(p)} onChange={(c) => set("compat", c ? [...new Set([...s.compat, p])] : s.compat.filter((x) => x !== p))} />)}<TextField label="Material" value={s.material} onChange={(v) => set("material", v)} /></div>
      </div>
      <div className="set-card"><div className="set-h"><span className="set-ic"><FiDollarSign /></span><div><h2>Pricing &amp; tax</h2><p>Price, discount and GST.</p></div></div><div className="grid g4">
        <TextField label="Price (₹)" type="number" value={s.price} onChange={(v) => set("price", v)} min={0} step="0.01" /><Select label="Discount" value={s.discountType} onChange={(v) => set("discountType", v)} options={[{ value: "none", label: "None" }, { value: "percent", label: "Percent" }, { value: "fixed", label: "Fixed ₹" }]} />
        {s.discountType !== "none" && <TextField label={s.discountType === "percent" ? "Discount %" : "Discount ₹"} type="number" value={s.discountValue} onChange={(v) => set("discountValue", v)} min={0} step="0.01" />}
        <TextField label="GST rate %" type="number" value={s.taxPct} onChange={(v) => set("taxPct", v)} min={0} step="0.5" hint="Confirm with your accountant" /><TextField label="HSN code" value={s.hsn} onChange={(v) => set("hsn", v)} hint="4–8 digits" /></div></div>
      <div className="set-card"><div className="set-h"><span className="set-ic"><FiInfo /></span><div className="grow"><h2>Product details</h2><p>Extra attributes such as size, flavour or weight.</p></div><button type="button" className="pf-add" title="Add custom detail" aria-label="Add custom detail" onClick={() => set("specs", [...s.specs, { key: "", value: "" }])}><FiPlus /></button></div>
        {s.specs.length === 0 ? <div className="set-empty">No extra details yet. Use + to add a variable and its value.</div> : <div className="pf-block">{s.specs.map((x, i) => <div key={i} className="pf-kv"><input placeholder="Variable (e.g. Flavour)" value={x.key} maxLength={60} onChange={(e) => set("specs", s.specs.map((y, j) => (j === i ? { ...y, key: e.target.value } : y)))} /><input placeholder="Value (e.g. Chicken)" value={x.value} maxLength={200} onChange={(e) => set("specs", s.specs.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} /><button type="button" className="pf-add pf-del" aria-label="Remove detail" onClick={() => set("specs", s.specs.filter((_, j) => j !== i))}><FiTrash2 /></button></div>)}</div>}</div>
      <div className="set-card"><div className="set-h"><span className="set-ic"><FiBox /></span><div><h2>Inventory</h2><p>Stock tracking and low-stock alerts.</p></div></div><div className="grid g4"><Check label="Track inventory" checked={s.trackInventory} onChange={(v) => set("trackInventory", v)} />{!id && <TextField label="Opening stock" type="number" value={s.stock} onChange={(v) => set("stock", v)} min={0} />}<TextField label="Low-stock alert at" type="number" value={s.lowStock} onChange={(v) => set("lowStock", v)} min={0} /><Select label="When out of stock" value={s.backorder} onChange={(v) => set("backorder", v)} options={[{ value: "deny", label: "Stop selling" }, { value: "allow", label: "Allow backorders" }]} /></div>{id && <StockBox id={id} rec={rec.data} onDone={rec.reload} />}</div>
      <div className="set-card"><div className="set-h"><span className="set-ic"><FiImage /></span><div><h2>Photos</h2><p>The primary image is shown first on the storefront.</p></div></div><MediaField value={s.media} onChange={(v) => set("media", v)} /></div>
      <div className="savebar"><Check label="Featured on home page" checked={s.isFeatured} onChange={(v) => set("isFeatured", v)} /><Check label="Visible" checked={s.isVisible} onChange={(v) => set("isVisible", v)} /><Check label="New arrival" checked={s.isNewArrival} onChange={(v) => set("isNewArrival", v)} /><Check label="Top selling" checked={s.isTopSelling} onChange={(v) => set("isTopSelling", v)} /><span className="grow" /><Can perm="catalog.write"><Button busy={busy} disabled={!s.name || !s.categoryId || !s.price} onClick={save}>{id ? "Save changes" : "Create (as draft)"}</Button></Can></div>
    </div>
  );
}

function StockBox({ id, rec, onDone }: { id: string; rec: Rec | null; onDone: () => void }) {
  const [mode, setMode] = useState("adjust"), [v, setV] = useState("");
  const { busy, run } = useAction();
  return (
    <div className="card col" style={{ background: "#fcfbf8" }}><div className="row"><strong>Stock now: {rec?.stockQuantity}</strong><span className="muted">reserved {rec?.reservedQuantity} · available {rec?.availableQuantity === Number.MAX_SAFE_INTEGER ? "∞" : rec?.availableQuantity}</span>{rec?.stockStatus && <Badge status={rec.stockStatus} />}</div>
      <div className="row" style={{ alignItems: "flex-end" }}><Select label="Change" value={mode} onChange={setMode} options={[{ value: "adjust", label: "Add / remove (+/−)" }, { value: "set", label: "Set exact quantity" }]} /><TextField label={mode === "set" ? "New quantity" : "Delta (e.g. 10 or -3)"} type="number" value={v} onChange={setV} /><Button busy={busy} disabled={v === ""} onClick={async () => { if (await run(() => api(`/api/admin/products/${id}/stock`, { method: "POST", body: { mode, value: Number(v) } }), "Stock updated")) { setV(""); onDone(); } }}>Apply</Button></div>
      <span className="small muted">Atomic: cannot go below zero or below the quantity reserved by open orders. Every change is logged.</span></div>
  );
}

// ------------------------------------------------------------------ list
export function CatalogList() {
  const [q, setQ] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1), [low, setLow] = useState(false);
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useApi<{ items: Rec[]; total: number; totalPages: number }>(`/api/admin/products${qs({ q: dq, status, page, pageSize: 20, lowStock: low ? "true" : undefined })}`);
  const { run } = useAction();
  const quick = async (r: Rec, st: string) => { if (await run(() => api(`/api/admin/products/${r._id}/publication`, { method: "PATCH", body: { status: st } }), `${r.name}: ${st}`)) reload(); };
  return (
    <div className="set pl">
      <div className="top"><div><h1>Products</h1><p className="muted small" style={{ margin: 0 }}>Manage your product catalog, stock and publishing.{data ? ` ${data.total} total.` : ""}</p></div><Can perm="catalog.write"><Link className="btn" href="/admin/products/new"><FiPlus /> New product</Link></Can></div>
      <div className="set-card pl-filter"><div className="grow"><TextField label="Search" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name, SKU, brand" /></div><Select label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "", label: "All" }, { value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "archived", label: "Archived" }]} /><Check label="Low stock only" checked={low} onChange={(v) => { setLow(v); setPage(1); }} /></div>
      {loading ? <Spinner /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.items.length ? <Empty>Nothing found.</Empty> : (
        <div className="set-card pl-tbl tw"><table className="t"><thead><tr><th>Name</th><th>SKU</th><th className="right">Price</th><th>Stock</th><th>Status</th><th /></tr></thead><tbody>
          {data.items.map((r) => <tr key={r._id}><td><Link className="pl-name" href={`/admin/products/${r._id}`}>{(r.media?.find((m) => m.isPrimary) ?? r.media?.[0])?.url ? <img src={(r.media.find((m) => m.isPrimary) ?? r.media[0]!).url} alt="" /> : <span className="pl-ph"><FiImage /></span>}<span><strong>{r.name}</strong></span></Link></td><td className="pl-type">{r.sku}</td><td className="right">{inr(r.finalPrice)}{r.finalPrice < r.price && <span className="strike">{inr(r.price)}</span>}</td>
            <td><strong>{r.availableQuantity === Number.MAX_SAFE_INTEGER ? "∞" : r.availableQuantity}</strong> <Badge status={r.stockStatus ?? ""} /></td><td><Badge status={r.status} /></td>
            <td className="right nowrap"><Can perm="catalog.write">{r.status === "published" ? <Button className="ghost sm" onClick={() => quick(r, "draft")}>Unpublish</Button> : r.status === "draft" ? <Button className="ghost sm" onClick={() => quick(r, "published")}>Publish</Button> : null}</Can></td></tr>)}
        </tbody></table></div>)}
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
export { ApiError, Alert, Field };
