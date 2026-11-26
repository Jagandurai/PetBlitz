"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ReactNode, useMemo, useState } from "react";
import { FiFilter, FiX } from "react-icons/fi";
import { LuCheck, LuChevronDown, LuLayoutGrid, LuMinus, LuSearchX, LuSlidersHorizontal } from "react-icons/lu";
import { ItemCard } from "./card";
import { CatNode, ProductData, animalLabel, catHref } from "./types";
import { Crumbs, GridSkeleton, Pagination } from "./ui";
import { qs } from "@/lib/ui/api";
import { ScrollLock } from "@/lib/ui/store";
import { useApi } from "@/lib/ui/hooks";
import { SortMenu } from "./sort-menu";
import "./catalog.css";

interface Facets { total: number; onSale: number; animals: { value: string; count: number }[]; brands?: { value: string; count: number }[] }
const SORTS = [["newest", "Newest first"], ["featured", "Featured"], ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"]];
const findCat = (n: CatNode[], slug: string, trail: CatNode[] = []): CatNode[] | null => { for (const c of n) { const t = [...trail, c]; if (c.slug === slug) return t; const r = findCat(c.children, slug, t); if (r) return r; } return null; };

/** A collapsible filter group. */
const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <details className="cf-group" open>
    <summary>{title}<LuChevronDown size={17} aria-hidden="true" /></summary>
    <div className="cf-body">{children}</div>
  </details>
);

type Tick = "on" | "mixed" | "off";
/** A category row's checkbox (drawing only: the row itself is the link). "mixed" = the selection is inside this category. */
const TickBox = ({ state }: { state: Tick }) => <span className={`cf-tick ${state}`} aria-hidden="true">{state === "on" ? <LuCheck size={13} strokeWidth={3.5} /> : state === "mixed" ? <LuMinus size={13} strokeWidth={3.5} /> : null}</span>;

/** A real checkbox or radio, drawn as a tidy row with an optional count. */
function Option({ type = "checkbox", name, checked, onChange, label, count }: { type?: "checkbox" | "radio"; name?: string; checked: boolean; onChange: (on: boolean) => void; label: string; count?: number }) {
  return (
    <label className={`cf-opt ${type}${checked ? " on" : ""}`}>
      <input type={type} name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="cf-box" aria-hidden="true"><LuCheck size={13} strokeWidth={3.5} /></span>
      <span className="cf-label">{label}</span>
      {count !== undefined && <span className="cf-count">{count}</span>}
    </label>
  );
}

/** Accessories catalog. Filters/options come from live data, so new brands appear automatically. */
export default function Catalog({ search }: { search?: boolean }) {
  const sp = useSearchParams(), router = useRouter();
  const get = (k: string) => sp.get(k) ?? "";
  const page = Math.max(1, Number(get("page") || 1));
  const [drawer, setDrawer] = useState(false);
  /** Categories the shopper opened or closed by hand; otherwise the branch being viewed is open. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const base = "/products";
  const set = (patch: Record<string, string | null>) => { const n = new URLSearchParams(sp.toString()); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } if (!("page" in patch)) n.delete("page"); router.replace(`${base}${n.toString() ? `?${n}` : ""}`, { scroll: false }); };
  const brands = get("brand").split(",").filter(Boolean);
  const apiPath = `/api/products${qs({ q: get("q"), category: get("category"), compatibility: get("for"), brand: get("brand"), inStock: get("inStock"), onSale: get("onSale"), sort: get("sort") || undefined, page, pageSize: 12 })}`;
  const list = useApi<{ items: ProductData[]; total: number; totalPages: number }>(apiPath);
  const facets = useApi<Facets>(`/api/catalog/facets${qs({ kind: "products", category: get("category") })}`);
  const cats = useApi<{ tree: CatNode[] }>("/api/categories");
  const roots = useMemo(() => cats.data?.tree ?? [], [cats.data]);
  // the "Accessories" root is already the breadcrumb's own "Accessories" step
  const shopRoot = roots.find((r) => r.slug === "accessories");
  const picked = get("category").split(",").filter(Boolean);
  const trails = picked.flatMap((s) => { const t = findCat(roots, s); return t ? [t] : []; });
  const nameOf = (slug: string) => findCat(roots, slug)?.at(-1)?.name ?? slug;
  /** The breadcrumb path only makes sense when exactly one category is chosen. */
  const trail = picked.length === 1 ? trails[0] ?? null : null;
  /**
   * Ticking adds to the selection, unticking removes. A category already includes everything under it, so ticking a
   * parent drops its ticked children, and ticking a child narrows a ticked parent. Top-level bars select just themselves.
   */
  const choose = (c: CatNode, depth: number) => {
    if (picked.includes(c.slug)) return picked.filter((s) => s !== c.slug);
    if (!depth) return [c.slug];
    const above = new Set((findCat(roots, c.slug) ?? []).slice(0, -1).map((t) => t.slug));
    return [...picked.filter((s) => !above.has(s) && !findCat(c.children, s)), c.slug].slice(-20);
  };
  const crumbs = (trail ?? []).filter((t) => t.id !== shopRoot?.id);
  const heading = search ? `Results for “${get("q")}”` : picked.length > 1 ? (picked.length === 2 ? picked.map(nameOf).join(" & ") : `${picked.length} categories`) : picked.length ? nameOf(picked[0]!) : get("onSale") ? "Offers & deals" : "All accessories";
  const f = facets.data;
  const chips: { label: string; clear: Record<string, string | null> }[] = [];
  if (get("q") && !search) chips.push({ label: `“${get("q")}”`, clear: { q: null } });
  picked.forEach((s) => chips.push({ label: nameOf(s), clear: { category: picked.filter((x) => x !== s).join(",") || null } }));
  if (get("for")) chips.push({ label: `For ${animalLabel(get("for"))}`, clear: { for: null } });
  brands.forEach((b) => chips.push({ label: b, clear: { brand: brands.filter((x) => x !== b).join(",") || null } }));
  if (get("inStock")) chips.push({ label: "In stock", clear: { inStock: null } });
  if (get("onSale")) chips.push({ label: "On offer", clear: { onSale: null } });
  const clearAll = () => router.replace(base, { scroll: false });

  const branch = (nodes: CatNode[], depth: number): ReactNode => (
    <ul className={depth ? "cf-sub" : "cf-tree"}>
      {nodes.map((c) => {
        const active = picked.includes(c.slug), within = trails.some((t) => t.slice(0, -1).some((x) => x.id === c.id));
        const next = choose(c, depth);
        const href = next.length ? `${base}?category=${next.join(",")}` : base;
        const toggle = () => set({ category: next.join(",") || null });
        // with nothing selected, the first parent starts open so shoppers can see what is inside
        const open = toggled[c.id] ?? (within || (!picked.length && !depth && c.id === nodes[0]?.id));
        // top-level parents have no checkbox (the bar itself shows selection); parents in between show a dash
        const tick: Tick = active ? "on" : within ? "mixed" : "off";
        return (
          <li key={c.id} className={`cf-l${Math.min(depth, 2)}`}>
            <div className={`cf-row${active ? " on" : within ? " within" : ""}`}>
              {depth > 0
                // a checkbox that is also a real link; a plain click keeps the other filters and the scroll position
                ? <Link href={href} role="checkbox" aria-checked={active ? true : within ? "mixed" : false} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); toggle(); }} onKeyDown={(e) => { if (e.key === " ") { e.preventDefault(); toggle(); } }}><TickBox state={tick} /><span>{c.name}</span></Link>
                : <Link href={href} aria-current={active ? "page" : undefined}><span>{c.name}</span></Link>}
              {c.children.length > 0 && <button type="button" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${c.name} sub-categories`} onClick={() => setToggled((t) => ({ ...t, [c.id]: !open }))}><LuChevronDown size={16} /></button>}
            </div>
            {c.children.length > 0 && open && branch(c.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  const panel = (
    <>
      <div className="cf-group cf-cats">
        <h3>Categories</h3>
        <div className="cf-body">
          <div className={`cf-row cf-all${!picked.length ? " on" : ""}`}><Link href={base} aria-current={!picked.length ? "page" : undefined}><LuLayoutGrid size={18} aria-hidden="true" /><span>All accessories</span></Link></div>
          {branch(roots, 0)}
        </div>
      </div>
      {f?.brands && f.brands.length > 0 && <Group title="Brand"><div className="cf-scroll">{f.brands.map((b) => <Option key={b.value} label={b.value} count={b.count} checked={brands.includes(b.value)} onChange={(on) => set({ brand: (on ? [...brands, b.value] : brands.filter((x) => x !== b.value)).join(",") || null })} />)}</div></Group>}
      {f && f.animals.length > 0 && <Group title="Suitable for">{f.animals.map((a) => <Option key={a.value} type="radio" name="for" label={animalLabel(a.value)} count={a.count} checked={get("for") === a.value} onChange={() => set({ for: a.value })} />)}{get("for") && <button type="button" className="cf-link" onClick={() => set({ for: null })}>Show all pets</button>}</Group>}
      <Group title="Availability">
        <Option label="In stock only" checked={!!get("inStock")} onChange={(on) => set({ inStock: on ? "true" : null })} />
        <Option label="On offer" count={f?.onSale} checked={!!get("onSale")} onChange={(on) => set({ onSale: on ? "true" : null })} />
      </Group>
    </>
  );

  return (
    <>
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Accessories", href: crumbs.length || search ? base : undefined }, ...crumbs.map((t, i) => ({ label: t.name, href: i < crumbs.length - 1 ? catHref(t) : undefined }))]} />
      <div className="sf-lay cf-layout">
        <aside className="sf-fil cf" aria-label="Filters">
          <div className="cf-head"><LuSlidersHorizontal size={18} aria-hidden="true" /><h2>Filters</h2>{chips.length > 0 && <><span className="cf-badge" aria-label={`${chips.length} applied`}>{chips.length}</span><button type="button" className="cf-link" onClick={clearAll}>Clear all</button></>}</div>
          {panel}
        </aside>
        <section>
          <div className="cf-bar">
            <div><h1>{heading}</h1><p>{list.data ? `${list.data.total} product${list.data.total === 1 ? "" : "s"}` : " "}</p></div>
            <div className="cf-tools">
              <button type="button" className="cf-open sf-only-m" onClick={() => setDrawer(true)}><FiFilter aria-hidden="true" /> Filters{chips.length ? ` (${chips.length})` : ""}</button>
              <SortMenu value={get("sort") || "newest"} options={SORTS} onChange={(v) => set({ sort: v === "newest" ? null : v })} />
            </div>
          </div>
          {chips.length > 0 && <div className="cf-chips">{chips.map((c) => <button type="button" key={c.label} aria-label={`Remove filter ${c.label}`} onClick={() => set(c.clear)}>{c.label} <FiX size={14} aria-hidden="true" /></button>)}<button type="button" className="cf-link" onClick={clearAll}>Clear all</button></div>}
          {list.error ? <div className="sf-empty"><h3>We couldn&apos;t load this page</h3><p>{list.error}</p><button className="sf-btn" onClick={list.reload}>Try again</button></div>
            : list.loading ? <GridSkeleton n={8} />
            : !list.data?.items.length ? (
              <div className="cf-empty">
                <span><LuSearchX size={34} aria-hidden="true" /></span>
                <h3>{chips.length ? "No products found" : "New products are on the way"}</h3>
                <p>{chips.length ? "Try another category or remove a filter." : "Please check back soon."}</p>
                {(chips.length > 0 || search) && <Link className="cf-cta" href={base}>Browse all accessories</Link>}
              </div>
            )
            : <div className="sf-grid l3">{list.data.items.map((i) => <ItemCard key={i.id} item={i} />)}</div>}
          {list.data && <Pagination page={page} totalPages={list.data.totalPages} onPage={(p) => { set({ page: String(p) }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
        </section>
      </div>
      {drawer && <><ScrollLock /><div className="sf-bg" onClick={() => setDrawer(false)} /><aside className="sf-dr l cf" role="dialog" aria-modal="true" aria-label="Filters"><header><b>Filters</b><button className="sf-icon" aria-label="Close filters" onClick={() => setDrawer(false)}><FiX size={22} /></button></header><div className="bd">{panel}</div><footer>{chips.length > 0 && <button type="button" className="cf-link" onClick={clearAll}>Clear all</button>}<button type="button" className="cf-cta" onClick={() => setDrawer(false)}>Show {list.data?.total ?? ""} results</button></footer></aside></>}
    </>
  );
}
