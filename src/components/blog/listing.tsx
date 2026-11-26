"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LuSearch } from "react-icons/lu";
import { FeaturedPost, PostCard } from "./card";
import { Crumbs, Empty, GridSkeleton, Pagination } from "@/components/store/ui";
import { qs } from "@/lib/ui/api";
import { useApi } from "@/lib/ui/hooks";
import type { BlogCard } from "@/services/blog.service";

interface Listing { items: BlogCard[]; featured: BlogCard | null; categories: { name: string; count: number }[]; total: number; totalPages: number }

/** Filters live in the URL, so any filtered view can be shared or bookmarked. */
export default function BlogListing() {
  const sp = useSearchParams(), router = useRouter();
  const q = sp.get("q") ?? "", category = sp.get("category") ?? "", tag = sp.get("tag") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const [term, setTerm] = useState(q);
  useEffect(() => { setTerm(q); }, [q]);
  const { data, loading, error, reload } = useApi<Listing>(`/api/blog${qs({ q, category, tag, page, pageSize: 9 })}`);
  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    if (!("page" in patch)) n.delete("page");
    router.replace(`/blog${n.size ? `?${n}` : ""}`, { scroll: false });
  };
  const filtered = !!(q || category || tag);
  return (
    <>
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Blog" }]} />
      <header className="bl-hero">
        <div><span>The PetBlitz Journal</span><h1>Tips, guides &amp; stories for happy pet homes</h1></div>
        <form role="search" onSubmit={(e) => { e.preventDefault(); set({ q: term.trim() || null }); }}>
          <LuSearch size={18} aria-hidden="true" /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search articles…" aria-label="Search articles" maxLength={100} /><button>Search</button>
        </form>
      </header>
      {!!data?.categories.length && (
        <div className="bl-filters" role="group" aria-label="Filter by category">
          <button className={!category ? "on" : ""} aria-pressed={!category} onClick={() => set({ category: null })}>All articles</button>
          {data.categories.map((c) => <button key={c.name} className={category === c.name ? "on" : ""} aria-pressed={category === c.name} onClick={() => set({ category: c.name })}>{c.name}<small>{c.count}</small></button>)}
        </div>
      )}
      {filtered && <p className="bl-result">{loading ? "Searching…" : `${data?.total ?? 0} article${data?.total === 1 ? "" : "s"}`}{q && <> for “{q}”</>}{tag && <> tagged #{tag}</>} · <button onClick={() => router.replace("/blog", { scroll: false })}>Clear filters</button></p>}
      {error ? <div className="sf-empty"><h3>We couldn&apos;t load the blog</h3><p>{error}</p><button className="sf-btn" onClick={reload}>Try again</button></div>
        : loading ? <GridSkeleton n={3} />
        : !data?.items.length && !data?.featured ? <Empty icon="📝" title={filtered ? "No articles match" : "Fresh articles are on the way"}>{filtered ? "Try another search or category." : "Please check back soon."}</Empty>
        : <>
            {data.featured && <FeaturedPost p={data.featured} />}
            {data.items.length > 0 && <div className="bl-grid">{data.items.map((p) => <PostCard key={p.id} p={p} />)}</div>}
          </>}
      {data && !loading && <Pagination page={page} totalPages={data.totalPages} onPage={(p) => { set({ page: String(p) }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
    </>
  );
}
