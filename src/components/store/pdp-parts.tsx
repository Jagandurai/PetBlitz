"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiCopy, FiFileText, FiList, FiStar, FiRefreshCw, FiShare2, FiShield, FiTruck } from "react-icons/fi";
import { ItemCard } from "./card";
import { ProductData, PublicSettings } from "./types";
import { Rail, SectionTitle, Stars } from "./ui";
import { api } from "@/lib/ui/api";
import { day, inr } from "@/lib/ui/format";
import { useApi } from "@/lib/ui/hooks";
import { useStore } from "@/lib/ui/store";

const TAB_ICONS: Record<string, typeof FiFileText> = { desc: FiFileText, spec: FiList, rev: FiStar };

export const SectionTabs = ({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) => (
  <div className="sf-tabs" role="tablist">
    {tabs.map((t) => {
      const Icon = TAB_ICONS[t.id] ?? FiFileText;
      return <button key={t.id} type="button" role="tab" aria-selected={active === t.id} data-tab={t.id} className={`sf-tab ${active === t.id ? "on" : ""}`} onClick={() => onChange(t.id)}><i aria-hidden="true"><Icon /></i><span>{t.label}</span></button>;
    })}
  </div>
);

export function SpecTable({ rows }: { rows: [string, string | undefined | null][] }) {
  const r = rows.filter(([, v]) => v);
  return r.length ? <table className="sf-spec"><tbody>{r.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody></table> : <p className="muted">No additional details.</p>;
}

/** Shipping, returns and payment facts, taken from the store settings. */
export function PurchasePerks() {
  const s = useApi<PublicSettings>("/api/settings/public");
  const fee = s.data?.shipping.baseFeeMinor, free = s.data?.shipping.freeAboveMinor;
  return (
    <ul className="pd-perks">
      {s.data && <li><i><FiTruck aria-hidden="true" /></i><span><b>Shipping {fee ? inr(fee) : "free"}</b>{free != null ? `Free above ${inr(free)}` : "Delivered across India"}</span></li>}
      {s.data && <li><i><FiRefreshCw aria-hidden="true" /></i><span><b>Easy returns</b>Within {s.data.returns.windowDays} days of delivery</span></li>}
      <li><i><FiShield aria-hidden="true" /></i><span><b>Secure payment</b>UPI, cards, netbanking or wallet</span></li>
    </ul>
  );
}

export function ShareButton({ title }: { title: string }) {
  const [ok, setOk] = useState(false);
  return <button className="sf-btn text" onClick={async () => { const url = window.location.href; try { if (navigator.share) await navigator.share({ title, url }); else { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 1800); } } catch { /* dismissed */ } }}>{ok ? <><FiCopy /> Link copied</> : <><FiShare2 /> Share</>}</button>;
}

interface Rv { id: string; rating: number; title?: string; comment?: string; images?: { url: string }[]; verifiedPurchase: boolean; createdAt: string }
export function Reviews({ id, rating }: { id: string; rating: { count: number; average: number | null } }) {
  const { data } = useApi<{ items: Rv[]; total: number }>(`/api/reviews?targetType=product&targetId=${id}&pageSize=50`);
  const [show, setShow] = useState(5);
  const dist = useMemo(() => [5, 4, 3, 2, 1].map((n) => ({ n, c: data?.items.filter((r) => r.rating === n).length ?? 0 })), [data]);
  const sample = data?.items.length ?? 0;
  return (
    <div className="sf-rev" id="reviews">
      <div className="sf-rs"><b>{rating.average?.toFixed(1) ?? "–"}</b><div><Stars r={rating} big /></div><p className="muted small" style={{ margin: "6px 0 0" }}>{rating.count ? `${rating.count} verified rating${rating.count > 1 ? "s" : ""}` : "Be the first to review"}</p>
        {sample > 0 && <div className="sf-bars" style={{ textAlign: "left", marginTop: 12 }}>{dist.map((d) => <div key={d.n}><span style={{ width: 28 }}>{d.n}★</span><span className="t"><i style={{ width: `${(d.c / sample) * 100}%` }} /></span><span style={{ width: 24, textAlign: "right" }}>{d.c}</span></div>)}</div>}</div>
      <div>
        {!data ? <p className="muted">Loading reviews…</p> : !data.items.length ? <div className="pd-noreview"><span aria-hidden="true">★★★★★</span><b>No reviews yet</b><p>Purchased this? You can review it from your orders once delivered.</p><Link className="sf-btn" href="/account/orders">Go to my orders</Link></div> : <>
          {data.items.slice(0, show).map((r) => <div key={r.id} className="sf-rv"><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ color: "var(--star)", letterSpacing: 1 }} aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}<span style={{ color: "#d0d5dd" }}>{"★".repeat(5 - r.rating)}</span></span>{r.title && <b>{r.title}</b>}</div>{r.comment && <p style={{ margin: "6px 0" }}>{r.comment}</p>}
            {r.images?.length ? <div style={{ display: "flex", gap: 8 }}>{r.images.map((im) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={im.url} src={im.url} alt="Customer photo" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} loading="lazy" />)}</div> : null}
            <div className="muted small" style={{ display: "flex", gap: 8 }}>{r.verifiedPurchase && <span style={{ color: "var(--ok)", fontWeight: 700 }}><FiCheckCircle style={{ verticalAlign: "-2px" }} /> Verified purchase</span>}<span>{day(r.createdAt)}</span></div></div>)}
          {show < data.items.length && <button className="sf-btn ghost" onClick={() => setShow(show + 5)}>Show more reviews</button>}</>}
      </div>
    </div>
  );
}

export function Related({ categorySlug, excludeId, title }: { categorySlug?: string; excludeId: string; title: string }) {
  const { data } = useApi<{ items: ProductData[] }>(`/api/products?${categorySlug ? `category=${categorySlug}&` : ""}pageSize=12`);
  const items = (data?.items ?? []).filter((i) => i.id !== excludeId).slice(0, 10);
  if (!items.length) return null;
  return <><SectionTitle title={title} href={categorySlug ? `/products?category=${categorySlug}` : "/products"} /><Rail label={title}>{items.map((i) => <ItemCard key={i.id} item={i} />)}</Rail></>;
}

export function RecentlyViewedTrack({ r }: { r: { kind: "products"; id: string; slug: string; name: string; image?: string; price: number; final: number } }) {
  const { pushRecent } = useStore();
  useEffect(() => { pushRecent(r); }, [r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export async function copyOk(text: string) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
export { api };
