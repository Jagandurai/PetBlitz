"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ItemCard } from "./card";
import { ProductData } from "./types";
import { Crumbs, Empty, GridSkeleton } from "./ui";
import { api } from "@/lib/ui/api";
import { useStore } from "@/lib/ui/store";
import "./cart.css";

/** Wishlist is stored on this device (localStorage) and refreshed with live prices/availability. */
export default function WishlistView() {
  const { wish } = useStore();
  const [rows, setRows] = useState<ProductData[] | null>(null);
  const key = wish.map((w) => w.id).join(",");
  useEffect(() => {
    let live = true;
    if (!wish.length) { setRows([]); return; }
    Promise.allSettled(wish.slice(0, 40).map((w) => api<ProductData>(`/api/products/${w.slug}`))).then((r) => { if (live) setRows(r.flatMap((x) => (x.status === "fulfilled" ? [x.value] : []))); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="wish-page">
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Wishlist" }]} />
      <div className="sf-bar"><h1>My wishlist</h1><span style={{ color: "var(--mu)" }}>{wish.length} saved on this device</span></div>
      {rows === null ? <GridSkeleton n={4} /> : !rows.length ? <Empty icon="💚" title="Your wishlist is empty" action={<Link className="sf-btn" href="/products">Discover accessories</Link>}>Tap the heart on any product to save it for later.</Empty>
        : <div className="sf-grid">{rows.map((r) => <ItemCard key={r.id} item={r} />)}</div>}
    </div>
  );
}
