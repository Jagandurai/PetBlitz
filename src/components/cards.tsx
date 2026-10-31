"use client";
import Link from "next/link";
import { Img } from "./ui";
import { inr } from "@/lib/ui/format";

export interface Media { kind: string; url: string; alt?: string; isPrimary?: boolean }
export interface Pricing { price: number; finalPrice: number; discountType: string; discountValue: number }
export interface PetItem { id: string; name: string; slug: string; type: string; breed?: string; media: Media[]; pricing: Pricing; availability: string; category?: { name: string; slug: string }; rating?: { count: number; average: number | null } }
export interface ProductItem { id: string; name: string; slug: string; brand?: string; media: Media[]; pricing: Pricing; stockStatus: string; category?: { name: string; slug: string }; rating?: { count: number; average: number | null } }

export const primary = (m: Media[]) => (m.find((x) => x.isPrimary) ?? m.find((x) => x.kind === "image"))?.url;
export const Price = ({ p }: { p: Pricing }) => <div><span className="price">{inr(p.finalPrice)}</span>{p.finalPrice < p.price && <span className="strike">{inr(p.price)}</span>}</div>;
export const Stars = ({ r }: { r?: { count: number; average: number | null } }) => r?.count ? <span className="small muted">★ {r.average} ({r.count})</span> : null;

export function ItemCard({ kind, item }: { kind: "pets" | "products"; item: PetItem | ProductItem }) {
  const sub = kind === "pets" ? (item as PetItem).breed : (item as ProductItem).brand;
  const status = kind === "pets" ? (item as PetItem).availability : (item as ProductItem).stockStatus;
  return (
    <Link href={`/${kind}/${item.slug}`} className="card flush pcard">
      <Img src={primary(item.media)} alt={item.name} className="im" />
      <div className="bd"><strong>{item.name}</strong>{sub && <span className="muted small">{sub}</span>}<Price p={item.pricing} /><div className="row between"><Stars r={item.rating} />{["reserved", "out_of_stock"].includes(status) && <span className="badge warn">{status === "reserved" ? "Reserved" : "Out of stock"}</span>}{status === "low_stock" && <span className="badge warn">Few left</span>}</div></div>
    </Link>
  );
}
