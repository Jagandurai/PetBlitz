"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ReactNode, useRef } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { inr } from "@/lib/ui/format";
import { cdn, pctOff } from "@/lib/ui/store";
import { Pricing, Rating } from "./types";

export const Stars = ({ r, big, link }: { r?: Rating | null; big?: boolean; link?: string }) => {
  if (!r?.count) return big ? <span className="sf-stars">No reviews yet</span> : null;
  const w = Math.max(0, Math.min(100, ((r.average ?? 0) / 5) * 100));
  const inner = <span className="sf-stars" style={big ? { fontSize: "1rem" } : undefined}><span className="sf-star" aria-hidden="true">★★★★★<i style={{ width: `${w}%` }}>★★★★★</i></span><span>{r.average?.toFixed(1)} ({r.count})</span></span>;
  return link ? <a href={link} aria-label={`Rated ${r.average} out of 5 from ${r.count} reviews`}>{inner}</a> : <span role="img" aria-label={`Rated ${r.average} out of 5 from ${r.count} reviews`}>{inner}</span>;
};

export function PriceTag({ p, size }: { p: Pricing; size?: "lg" }) {
  const off = pctOff(p.price, p.finalPrice);
  return (
    <div className="sf-pr">
      <b className={size === "lg" ? "sf-big" : undefined}>{inr(p.finalPrice)}</b>
      {off > 0 && <><s>{inr(p.price)}</s><em>{off}% off</em></>}
    </div>
  );
}

export function Qty({ value, onChange, min = 1, max = 20, disabled }: { value: number; onChange: (n: number) => void; min?: number; max?: number; disabled?: boolean }) {
  return <div className="sf-qty" role="group" aria-label="Quantity"><button type="button" aria-label="Decrease quantity" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>−</button><span aria-live="polite">{value}</span><button type="button" aria-label="Increase quantity" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button></div>;
}

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return <nav className="sf-crumb" aria-label="Breadcrumb">{items.map((c, i) => <span key={i}>{c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page" style={{ color: "var(--ink)" }}>{c.label}</span>}{i < items.length - 1 && " ›"}</span>)}</nav>;
}

export const SectionTitle = ({ title, href, cta = "View all" }: { title: string; href?: string; cta?: string }) => <div className="sf-h2"><h2>{title}</h2>{href && <Link href={href}>{cta} →</Link>}</div>;

export const Empty = ({ icon = "🐾", title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) => <div className="sf-empty"><div className="big" aria-hidden="true">{icon}</div><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;

export const CardSkeleton = () => <div className="sf-pc" aria-hidden="true"><div className="sf-pimg sf-sk" /><div className="sf-pb"><div className="sf-brand"><div className="sf-sk" style={{ height: 10, width: "40%" }} /></div><div className="sf-pt"><div className="sf-sk" style={{ height: 14 }} /><div className="sf-sk" style={{ height: 14, width: "70%", marginTop: 6 }} /></div><div className="sf-rate" /><div className="sf-sk" style={{ height: 22, width: "50%" }} /><div className="sf-add"><div className="sf-sk" style={{ height: 44, borderRadius: 9 }} /></div></div></div>;
export const GridSkeleton = ({ n = 8 }: { n?: number }) => <div className="sf-grid" role="status" aria-label="Loading">{Array.from({ length: n }, (_, i) => <CardSkeleton key={i} />)}</div>;
export const Skel = ({ h = 16, w = "100%", r = 8 }: { h?: number; w?: string | number; r?: number }) => <div className="sf-sk" style={{ height: h, width: w, borderRadius: r }} />;

/** Horizontal scroller with arrow buttons (desktop) and native swipe (mobile). */
export function Rail({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const go = (d: number) => ref.current?.scrollBy({ left: d * 480, behavior: "smooth" });
  return (
    <div style={{ position: "relative" }}>
      <div className="sf-rail" ref={ref} role="region" aria-label={label} tabIndex={0}>{children}</div>
      <button className="sf-icon hide-m" aria-label="Scroll left" onClick={() => go(-1)} style={{ position: "absolute", left: -14, top: "38%", background: "#fff", boxShadow: "var(--sh2)" }}><FiChevronLeft size={20} /></button>
      <button className="sf-icon hide-m" aria-label="Scroll right" onClick={() => go(1)} style={{ position: "absolute", right: -14, top: "38%", background: "#fff", boxShadow: "var(--sh2)" }}><FiChevronRight size={20} /></button>
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const set = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const nums = [...set].sort((a, b) => a - b);
  return (
    <nav className="sf-pager" aria-label="Pagination">
      <button className="sf-pg" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
      {nums.map((n, i) => <span key={n} style={{ display: "contents" }}>{i > 0 && n - nums[i - 1]! > 1 && <span style={{ alignSelf: "center" }}>…</span>}<button className={`sf-pg ${n === page ? "on" : ""}`} onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}>{n}</button></span>)}
      <button className="sf-pg" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
    </nav>
  );
}

export const Img = ({ src, alt, w = 600, className, eager }: { src?: string; alt: string; w?: number; className?: string; eager?: boolean }) =>
  src ? <img src={cdn(src, w)} alt={alt} className={className} loading={eager ? "eager" : "lazy"} decoding="async" /> : <div className={className} style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.4rem", background: "#f1ece1", width: "100%", height: "100%" }} role="img" aria-label={alt}>🐾</div>;
