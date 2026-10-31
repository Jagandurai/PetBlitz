"use client";
import Link from "next/link";
import { ReactNode } from "react";
import { FiHeart, FiLock, FiRotateCcw } from "react-icons/fi";
import { ItemCard, PetItem, primary, ProductItem } from "@/components/cards";
import { BiscuitHero } from "@/components/biscuit-hero";
import { Img, Spinner } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/content/pages";
import { useApi } from "@/lib/ui/hooks";

type List<T> = { items: T[] };

function Section<T extends PetItem | ProductItem>({ title, href, kind, data, empty }: { title: string; href: string; kind: "pets" | "products"; data: { data: List<T> | null; loading: boolean; error: string | null }; empty?: ReactNode }) {
  if (!data.loading && !data.error && !data.data?.items.length && !empty) return null;
  return (
    <section className="mb">
      <div className="row between"><h2>{title}</h2><Link href={href}>View all →</Link></div>
      {data.loading ? <Spinner /> : data.error ? <p className="muted">Could not load this section right now.</p> : data.data?.items.length ? <div className="grid gauto">{data.data.items.map((p) => <ItemCard key={p.id} kind={kind} item={p} />)}</div> : <p className="muted">{empty}</p>}
    </section>
  );
}

export default function Home() {
  const dogs = useApi<List<PetItem>>("/api/pets?type=dog&featured=true&pageSize=4");
  const cats = useApi<List<PetItem>>("/api/pets?type=cat&featured=true&pageSize=4");
  const acc = useApi<List<ProductItem>>("/api/products?featured=true&pageSize=4");
  const newPets = useApi<List<PetItem>>("/api/pets?sort=newest&pageSize=4");
  const newProds = useApi<List<ProductItem>>("/api/products?sort=newest&pageSize=8");
  const settings = useApi<{ shipping: { freeAboveMinor: number | null } }>("/api/settings/public");
  const prods = newProds.data?.items ?? [];
  const limited = { data: { items: prods.filter((p) => p.stockStatus === "low_stock") }, loading: newProds.loading, error: newProds.error };
  const offers = { data: { items: prods.filter((p) => p.pricing.finalPrice < p.pricing.price) }, loading: newProds.loading, error: newProds.error };
  const cards: [string, string, string, string | undefined][] = [
    ["Dogs", "/dogs", "Find a loyal companion for your family.", dogs.data?.items[0] && primary(dogs.data.items[0].media)],
    ["Cats", "/cats", "Curious, cuddly kittens and cats.", cats.data?.items[0] && primary(cats.data.items[0].media)],
    ["Accessories", "/accessories", "Everything your pet needs, from toys to grooming.", acc.data?.items[0] && primary(acc.data.items[0].media)],
  ];
  return (
    <>
      <BiscuitHero />
      {settings.data?.shipping.freeAboveMinor ? <p className="small center mb">Free shipping on accessories above ₹{(settings.data.shipping.freeAboveMinor / 100).toFixed(0)}</p> : null}
      <section className="grid g3 mb cats3">
        {cards.map(([t, h, d, img]) => <Link key={t} href={h} className="card flush cc"><Img src={img} alt={t} className="im" /><div style={{ padding: "0 16px 16px" }}><h3>{t}</h3><p className="muted">{d}</p><span className="btn ghost sm">Explore</span></div></Link>)}
      </section>
      <Section title="Featured dogs" href="/dogs" kind="pets" data={dogs} empty="New dogs are added regularly — check back soon." />
      <Section title="Featured cats" href="/cats" kind="pets" data={cats} empty="New cats are added regularly — check back soon." />
      <Section title="Featured accessories" href="/accessories" kind="products" data={acc} empty="Accessories are coming soon." />
      <Section title="New arrival pets" href="/dogs" kind="pets" data={newPets} />
      <Section title="New arrival accessories" href="/accessories" kind="products" data={{ ...newProds, data: newProds.data && { items: newProds.data.items.slice(0, 4) } }} />
      <Section title="Offers & discounts" href="/accessories" kind="products" data={offers} />
      <Section title="Limited availability" href="/accessories" kind="products" data={limited} />
      <section className="grid g3 mb">{[[<FiHeart key="a" />, "Clear listings", "Prices, availability and details are kept up to date by our team."], [<FiLock key="b" />, "Secure payments", "Pay securely online with UPI, cards or your PetBlitz wallet."], [<FiRotateCcw key="c" />, "Easy refunds", "Cancelled? Refunds land in your wallet instantly."]].map(([i, t, d]) => <div key={String(t)} className="card"><div style={{ fontSize: "1.8rem" }}>{i}</div><h3>{t}</h3><p className="muted">{d}</p></div>)}</section>
      <section className="card row between mb"><div><h2>Need help choosing?</h2><p className="muted">Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or send us an enquiry.</p></div><div className="row"><Link className="btn" href="/contact">Contact Us</Link><Link className="btn ghost" href="/support">Support</Link></div></section>
    </>
  );
}
