"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ItemCard, PetItem, ProductItem } from "./cards";
import { Empty, ErrorBox, Pager, Select, Spinner, TextField, useDebounced } from "./ui";
import { qs } from "@/lib/ui/api";
import { useApi } from "@/lib/ui/hooks";

interface Cat { id: string; name: string; slug: string; type: string; children: Cat[] }
const flatten = (n: Cat[], depth = 0): { slug: string; label: string; type: string }[] => n.flatMap((c) => [{ slug: c.slug, label: `${"— ".repeat(depth)}${c.name}`, type: c.type }, ...flatten(c.children, depth + 1)]);

/** Shared listing for /pets and /products. State lives in the URL so pages are shareable and the back button works. */
export default function Listing({ kind, basePath, fixedType, heading }: { kind: "pets" | "products"; basePath?: string; fixedType?: "dog" | "cat"; heading?: string }) {
  const sp = useSearchParams(), router = useRouter();
  const get = (k: string) => sp.get(k) ?? "";
  const [q, setQ] = useState(get("q"));
  const dq = useDebounced(q);
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp.toString()); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } if (!("page" in patch)) n.delete("page"); router.replace(`${basePath ?? `/${kind}`}${n.toString() ? `?${n}` : ""}`); };
  const page = Number(get("page") || 1);
  const path = useMemo(() => `/api/${kind}${qs({ q: dq || get("q") === dq ? dq : undefined, category: get("category"), type: fixedType ?? get("type"), breed: kind === "pets" ? get("breed") : undefined, compatibility: get("compatibility"), sort: get("sort") || undefined, minPrice: get("min") ? Math.round(Number(get("min")) * 100) : undefined, maxPrice: get("max") ? Math.round(Number(get("max")) * 100) : undefined, inStock: get("inStock") || undefined, page, pageSize: 12 })}`, [kind, dq, sp, page]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, loading, error, reload } = useApi<{ items: (PetItem | ProductItem)[]; total: number; totalPages: number }>(path);
  const cats = useApi<{ tree: Cat[] }>("/api/categories");
  const options = flatten(cats.data?.tree ?? []).filter((c) => (kind === "products" ? c.type === "accessory" : c.type !== "accessory"));
  return (
    <div className="grid" style={{ gridTemplateColumns: "240px 1fr", alignItems: "start" }}>
      <aside className="card col hide-m" aria-label="Filters">
        <h3>Filters</h3>
        <TextField label="Search" value={q} onChange={(v) => { setQ(v); }} placeholder="Name, breed, brand…" />
        <Select label="Category" value={get("category")} onChange={(v) => set({ category: v })} options={[{ value: "", label: "All" }, ...options.map((o) => ({ value: o.slug, label: o.label }))]} />
        {kind === "pets" ? <>{!fixedType && <Select label="Type" value={get("type")} onChange={(v) => set({ type: v })} options={[{ value: "", label: "Dogs & cats" }, { value: "dog", label: "Dogs" }, { value: "cat", label: "Cats" }]} />}<TextField label="Breed" value={get("breed")} onChange={(v) => set({ breed: v })} /></> : <><Select label="For" value={get("compatibility")} onChange={(v) => set({ compatibility: v })} options={[{ value: "", label: "Dogs & cats" }, { value: "dog", label: "Dogs" }, { value: "cat", label: "Cats" }]} /><label className="chk"><input type="checkbox" checked={get("inStock") === "true"} onChange={(e) => set({ inStock: e.target.checked ? "true" : "" })} />In stock only</label></>}
        <div className="row"><div className="grow"><TextField label="Min ₹" type="number" value={get("min")} onChange={(v) => set({ min: v })} min={0} /></div><div className="grow"><TextField label="Max ₹" type="number" value={get("max")} onChange={(v) => set({ max: v })} min={0} /></div></div>
        <Select label="Sort" value={get("sort") || "newest"} onChange={(v) => set({ sort: v })} options={[{ value: "newest", label: "Newest" }, { value: "price_asc", label: "Price: low → high" }, { value: "price_desc", label: "Price: high → low" }, { value: "featured", label: "Featured" }]} />
        <button className="btn sm" onClick={() => set({ q })}>Apply search</button>
        <button className="btn ghost sm" onClick={() => { setQ(""); router.replace(basePath ?? `/${kind}`); }}>Clear all</button>
      </aside>
      <section>
        <div className="row between mb"><h1>{heading ?? (kind === "pets" ? "Pets" : "Accessories")}</h1><span className="muted">{data ? `${data.total} result${data.total === 1 ? "" : "s"}` : ""}</span></div>
        {error ? <ErrorBox msg={error} retry={reload} /> : loading ? <Spinner /> : !data?.items.length ? <Empty>Nothing matches these filters. Try clearing them.</Empty> : <div className="grid gauto">{data.items.map((i) => <ItemCard key={i.id} kind={kind} item={i} />)}</div>}
        {data && <Pager page={page} totalPages={data.totalPages} onPage={(p) => set({ page: String(p) })} />}
      </section>
    </div>
  );
}
