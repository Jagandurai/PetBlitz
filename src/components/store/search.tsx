"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ItemCard } from "./card";
import { ProductData } from "./types";
import { Crumbs, Empty, GridSkeleton, SectionTitle } from "./ui";
import { qs } from "@/lib/ui/api";
import { useApi } from "@/lib/ui/hooks";

export default function SearchView() {
  const q = (useSearchParams().get("q") ?? "").trim();
  const prods = useApi<{ items: ProductData[]; total: number }>(q ? `/api/products${qs({ q, pageSize: 8 })}` : null);
  if (!q) return <Empty icon="🔎" title="What are you looking for?" action={<Link className="sf-btn" href="/products">Browse accessories</Link>}>Type in the search box above to find food, toys and more.</Empty>;
  const loading = prods.loading, none = !loading && !prods.data?.total;
  return (
    <>
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Search" }]} />
      <div className="sf-bar"><h1>Results for “{q}”</h1><span style={{ color: "var(--mu)" }}>{loading ? "" : `${prods.data?.total ?? 0} matches`}</span></div>
      {loading && <GridSkeleton n={4} />}
      {none && <Empty icon="😕" title={`Nothing found for “${q}”`} action={<Link className="sf-btn" href="/products">Browse accessories</Link>}>Check the spelling or try a more general word like “dog” or “toy”.</Empty>}
      {!!prods.data?.items.length && <><SectionTitle title={`Products (${prods.data.total})`} href={`/products?q=${encodeURIComponent(q)}`} cta="See all products" /><div className="sf-grid">{prods.data.items.map((i) => <ItemCard key={i.id} item={i} />)}</div></>}
    </>
  );
}
