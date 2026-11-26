"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FiShoppingCart, FiZap } from "react-icons/fi";
import { Heart } from "./card";
import Gallery from "./gallery";
import { PurchasePerks, Related, RecentlyViewedTrack, Reviews, SectionTabs, ShareButton, SpecTable } from "./pdp-parts";
import { ProductData, animalLabel } from "./types";
import { Crumbs, PriceTag, Qty, Stars } from "./ui";
import { inr } from "@/lib/ui/format";
import { pctOff, useStore } from "@/lib/ui/store";
import "./pdp.css";

export default function ProductView({ p }: { p: ProductData }) {
  const { addToCart } = useStore();
  const router = useRouter();
  const [qty, setQty] = useState(1), [busy, setBusy] = useState(""), [tab, setTab] = useState("desc");
  const out = p.stockStatus === "out_of_stock", off = pctOff(p.pricing.price, p.pricing.finalPrice), save = p.pricing.price - p.pricing.finalPrice;
  const primary = p.media.find((m) => m.isPrimary)?.url ?? p.media[0]?.url;
  const add = async (buy: boolean) => { setBusy(buy ? "buy" : "add"); const ok = await addToCart({ id: p.id, quantity: qty }, { open: !buy, next: `/products/${p.slug}` }); setBusy(""); if (ok && buy) router.push("/checkout"); };
  const highlights = (p.specifications ?? []).slice(0, 4);
  return (
    <div className="pd">
      <RecentlyViewedTrack r={{ kind: "products", id: p.id, slug: p.slug, name: p.name, image: primary, price: p.pricing.price, final: p.pricing.finalPrice }} />
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Accessories", href: "/products" }, ...(p.category ? [{ label: p.category.name, href: `/products?category=${p.category.slug}` }] : []), { label: p.name }]} />
      <div className="sf-pdp">
        <Gallery media={p.media} alt={p.name} badge={[p.isTopSelling ? "Top Selling" : "", off ? `${off}% OFF` : ""].filter(Boolean).join(" · ") || undefined} />
        <div className="pd-info">
          {p.brand && <a href={`/products?brand=${encodeURIComponent(p.brand)}`} className="sf-brand" style={{ color: "var(--b)" }}>{p.brand}</a>}
          <h1 className="sf-pt1">{p.name}</h1>
          <div className="pd-meta"><Stars r={p.rating} big link="#reviews" />{p.sku && <span className="muted small" style={{ color: "var(--mu)" }}>SKU {p.sku}</span>}</div>
          <div className="sf-pbox pd-buy">
            <PriceTag p={p.pricing} size="lg" />
            {save > 0 && <div className="sf-save">You save {inr(save)} ({off}%)</div>}
            <div className="pd-tax">Inclusive of GST where applicable. Shipping calculated at checkout.</div>
            <div className={`pd-stock ${out ? "out" : p.stockStatus === "low_stock" ? "low" : "ok"}`}>{out ? "Currently out of stock" : p.stockStatus === "low_stock" ? "Hurry — only a few left" : p.stockStatus === "backorder" ? "Available on backorder" : "In stock"}</div>
            {!out && <div className="pd-actions"><Qty value={qty} onChange={setQty} /><button className="sf-btn lg" disabled={!!busy} onClick={() => add(false)}><FiShoppingCart />{busy === "add" ? "Adding…" : "Add to cart"}</button><button className="sf-btn amber lg" disabled={!!busy} onClick={() => add(true)}><FiZap />Buy now</button></div>}
            <div className="pd-save"><span className="sf-heart-inline"><Heart id={p.id} slug={p.slug} label={p.name} /></span><span>Save for later</span><span className="pd-share"><ShareButton title={p.name} /></span></div>
          </div>
          <PurchasePerks />
          {p.compatibility?.length ? <div className="sf-chips pd-chips">{p.compatibility.map((c) => <span key={c} className="sf-chip">For {animalLabel(c)}s</span>)}</div> : null}
          {p.shortDescription && <p className="pd-short">{p.shortDescription}</p>}
          {highlights.length > 0 && <ul className="pd-high">{highlights.map((h) => <li key={h.key}><b>{h.key}:</b> {h.value}</li>)}</ul>}
        </div>
      </div>
      <section className="pd-details" data-active={tab} aria-label="Product information">
      <SectionTabs active={tab} onChange={setTab} tabs={[{ id: "desc", label: "Description" }, { id: "spec", label: "Specifications" }, { id: "rev", label: `Reviews (${p.rating.count})` }]} />
      <div className="sf-pane" role="tabpanel" key={tab}>
        <h2 className="pd-pane-title">{tab === "desc" ? "About this product" : tab === "spec" ? "Product specifications" : "Customer reviews"}</h2>
        {tab === "desc" && <div className="pd-desc">{p.description || p.shortDescription || "No description provided."}</div>}
        {tab === "spec" && <SpecTable rows={[["Brand", p.brand], ["Category", p.category?.name], ["Type", p.productType], ["Suitable for", p.compatibility?.map(animalLabel).join(", ")], ["Material", p.material], ["Colours", p.colors?.join(", ")], ["Sizes", p.sizes?.join(", ")], ...(p.specifications ?? []).map((s): [string, string] => [s.key, s.value])]} />}
        {tab === "rev" && <Reviews id={p.id} rating={p.rating} />}
      </div>
      </section>
      <Related categorySlug={p.category?.slug} excludeId={p.id} title="You may also like" />
      <div className="sf-stk"><div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}><b>{inr(p.pricing.finalPrice)}</b>{off > 0 && <s className="muted small" style={{ color: "var(--mu)" }}>{inr(p.pricing.price)}</s>}</div><button className="sf-btn" disabled={out || !!busy} onClick={() => add(false)}>{out ? "Out of stock" : "Add to cart"}</button><button className="sf-btn amber" disabled={out || !!busy} onClick={() => add(true)}>Buy now</button></div>
    </div>
  );
}
