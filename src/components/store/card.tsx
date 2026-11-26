"use client";
import Link from "next/link";
import { useState } from "react";
import { FiHeart, FiShoppingCart } from "react-icons/fi";
import { LuStar } from "react-icons/lu";
import { Img } from "./ui";
import { cdn } from "@/lib/ui/cdn";
import { ProductData } from "./types";
import { inr } from "@/lib/ui/format";
import { pctOff, useStore } from "@/lib/ui/store";

/** Card prices drop ".00"; paise are still shown when there are any. */
const money = (minor: number) => (minor % 100 ? inr(minor) : inr(minor).slice(0, -3));

const imgs = (m: { kind: string; url: string; isPrimary?: boolean }[]) => { const i = m.filter((x) => x.kind === "image"); const p = i.find((x) => x.isPrimary) ?? i[0]; return { a: p?.url, b: i.find((x) => x.url !== p?.url)?.url }; };

/** Near-square photos fill the frame (at most a fifth is trimmed, on screen only); wider or taller ones are shown whole. */
const fit = (img: HTMLImageElement) => { const r = img.naturalWidth / img.naturalHeight; if (r >= 0.8 && r <= 1.25) img.classList.add("fill"); };

function Photo({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  if (!src) return <Img alt={alt} className={className} />;
  // the ref covers pictures that finished loading before React attached onLoad
  return <img src={cdn(src, 600)} alt={alt} className={className} loading="lazy" decoding="async" ref={(el) => { if (el?.complete && el.naturalWidth) fit(el); }} onLoad={(e) => fit(e.currentTarget)} />; // eslint-disable-line @next/next/no-img-element
}

export function Heart({ id, slug, label }: { id: string; slug: string; label: string }) {
  const { isWished, toggleWish } = useStore();
  const on = isWished(id);
  return <button className={`sf-heart ${on ? "on" : ""}`} aria-pressed={on} aria-label={on ? `Remove ${label} from wishlist` : `Save ${label} to wishlist`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWish({ kind: "products", id, slug }); }}><FiHeart size={22} aria-hidden="true" fill={on ? "currentColor" : "none"} /></button>;
}

/** Product card with a one-click Add to cart. */
export function ItemCard({ item }: { item: ProductData }) {
  const { addToCart } = useStore();
  const [busy, setBusy] = useState(false);
  const { a, b } = imgs(item.media);
  const href = `/products/${item.slug}`;
  const off = pctOff(item.pricing.price, item.pricing.finalPrice);
  const out = item.stockStatus === "out_of_stock";
  return (
    <article className="sf-pc">
      <Link href={href} aria-label={item.name} className="sf-pimg-link">
        <div className="sf-pimg">
          <Photo src={a} alt={item.name} className={b ? "a" : undefined} />{b && <Photo src={b} alt="" className="b" />}
          {/* one badge, from real product data */}
          <div className="sf-tags">{out ? <span className="sf-tag out">Sold Out</span> : item.isTopSelling ? <span className="sf-tag top">Top Selling</span> : item.isNewArrival ? <span className="sf-tag new">New</span> : off > 0 && <span className="sf-tag sale">Sale</span>}</div>
        </div>
      </Link>
      <Heart id={item.id} slug={item.slug} label={item.name} />
      <div className="sf-pb">
        {/* the brand row is kept when empty so titles line up; spare height goes above the button */}
        <div className="sf-brand">{item.brand}</div>
        <Link href={href} className="sf-pt">{item.name}</Link>
        {item.rating?.count > 0 && <div className="sf-rate"><span className="sf-rpill" aria-label={`Rated ${item.rating.average?.toFixed(1)} out of 5`}>{item.rating.average?.toFixed(1)}<LuStar aria-hidden="true" /></span><span className="sf-rcount">({item.rating.count})</span></div>}
        <div className="sf-pr"><b>{money(item.pricing.finalPrice)}</b>{off > 0 && <><s>{money(item.pricing.price)}</s><em>{off}% off</em></>}</div>
        <div className="sf-add">
          <button type="button" className="sf-btn block" aria-busy={busy} disabled={busy || out} onClick={async () => { setBusy(true); await addToCart({ id: item.id, quantity: 1 }, { next: href }); setBusy(false); }}>{out ? "Sold Out" : <>{busy ? <span className="sf-spin" aria-hidden="true" /> : <FiShoppingCart aria-hidden="true" />}{busy ? "Adding…" : "Add to Cart"}</>}</button>
        </div>
      </div>
    </article>
  );
}
