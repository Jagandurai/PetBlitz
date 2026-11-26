"use client";
import Link from "next/link";
import { CSSProperties, ReactNode, useRef } from "react";
import { LuArrowRight, LuBadgeCheck, LuChevronLeft, LuChevronRight, LuHeadset, LuShieldCheck, LuTruck } from "react-icons/lu";
import { ItemCard } from "@/components/store/card";
import { BlogQuickAccessBanner } from "./blog-banner";
import type { ProductData } from "@/components/store/types";
import { useApi } from "@/lib/ui/hooks";
import { useStore } from "@/lib/ui/store";
import { CategoryIcon } from "./category-icons";
import { PromoMosaic } from "./promo";
import { useReveal } from "./reveal";
import type { HomeData } from "./types";

const RECENT_SHOWN = 10;
const PROMISES = [
  { icon: LuBadgeCheck, title: "Quality Products", text: "Carefully selected pet accessories." },
  { icon: LuShieldCheck, title: "Secure Payments", text: "Safe and secure shopping." },
  { icon: LuTruck, title: "Reliable Delivery", text: "Delivered with care." },
  { icon: LuHeadset, title: "Dedicated Support", text: "We're here to help." },
];
const order = (i: number) => ({ "--i": i }) as CSSProperties;

function Section({ id, heading, action, children }: { id: string; heading: string; action?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useReveal(ref);
  return (
    <section ref={ref} className="hp-sec" data-section={id} aria-labelledby={`hp-${id}`}>
      <div className="hp-wrap">
        <header className="hp-head"><h2 id={`hp-${id}`}>{heading}</h2>{action}</header>
        {children}
      </div>
    </section>
  );
}

function Categories({ items }: { items: HomeData["categories"] }) {
  return (
    <Section id="categories" heading="Shop by Category">
      <ul className="hp-cats">
        {items.map((c, i) => (
          <li key={c.key} style={order(i)}>
            <Link href={c.href} className={`hp-cat tone-${i % 3}`}>
              <span className="hp-cat-icon"><CategoryIcon name={c.key} /></span>
              <span className="hp-cat-name">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function NewArrivals({ items }: { items: ProductData[] }) {
  return (
    <Section id="new-arrivals" heading="New Arrivals" action={<Link href="/products?sort=newest" className="hp-all">View All <LuArrowRight aria-hidden="true" /></Link>}>
      <ul className="hp-products">{items.map((p, i) => <li key={p.id} style={order(i % 5)}><ItemCard item={p} /></li>)}</ul>
    </Section>
  );
}

function Featured({ items }: { items: ProductData[] }) {
  return (
    <Section id="featured" heading="Featured Products" action={<Link href="/products?sort=featured" className="hp-all">View All <LuArrowRight aria-hidden="true" /></Link>}>
      <ul className="hp-products">{items.map((p, i) => <li key={p.id} style={order(i % 4)}><ItemCard item={p} /></li>)}</ul>
    </Section>
  );
}

function RecentRail({ items }: { items: ProductData[] }) {
  const rail = useRef<HTMLUListElement>(null);
  const go = (d: number) => rail.current?.scrollBy({ left: d * rail.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <Section id="recently-viewed" heading="Recently Viewed" action={items.length > 4 ? <div className="hp-arrows"><button type="button" aria-label="Scroll back" onClick={() => go(-1)}><LuChevronLeft /></button><button type="button" aria-label="Scroll forward" onClick={() => go(1)}><LuChevronRight /></button></div> : null}>
      <ul ref={rail} className="hp-rail" tabIndex={0} aria-label="Recently viewed products">{items.map((p) => <li key={p.id}><ItemCard item={p} /></li>)}</ul>
    </Section>
  );
}

/** Reads this browser's history (kept per account), then asks for current details. Renders nothing when there is none. */
function RecentlyViewed() {
  const { recent } = useStore();
  const ids = recent.slice(0, RECENT_SHOWN).map((r) => r.id).filter((id) => /^[a-f\d]{24}$/i.test(id));
  const { data } = useApi<{ items: ProductData[] }>(ids.length ? `/api/homepage/products?ids=${ids.join(",")}` : null);
  const items = ids.length ? (data?.items ?? []).filter((p) => ids.includes(p.id)) : [];
  return items.length ? <RecentRail items={items} /> : null;
}

function OurPromise() {
  return (
    <Section id="promise" heading="Our Promise">
      <ul className="hp-promise">
        {PROMISES.map(({ icon: Icon, title, text }, i) => (
          <li key={title} style={order(i)}><span className="hp-promise-ic"><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></li>
        ))}
      </ul>
    </Section>
  );
}

/** Fixed section order. */
export function HomeSections({ data }: { data: HomeData }) {
  return (
    <>
      <Categories items={data.categories} />
      {data.banners.some((b) => b.heading || b.paragraph || b.imageUrl) && <PromoMosaic banners={data.banners} />}
      {data.newArrivals.length > 0 && <NewArrivals items={data.newArrivals} />}
      {data.featured.length > 0 && <Featured items={data.featured} />}
      <BlogQuickAccessBanner />
      <RecentlyViewed />
      <OurPromise />
    </>
  );
}
