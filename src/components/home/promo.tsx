"use client";
/* eslint-disable @next/next/no-img-element */
import { CSSProperties, useRef } from "react";
import { LuPawPrint } from "react-icons/lu";
import { cdn } from "@/lib/ui/cdn";
import { BANNER_LAYOUT as L } from "@/lib/ui/image-presets";
import { useReveal } from "./reveal";
import type { HomeBanner } from "./types";

const WIDTHS = [420, 640, 960, 1280, 1600];

/** Grid and card proportions, read by home.css. */
const GRID = { "--bn-cols": L.columns.map((c) => `minmax(0,${c}fr)`).join(" "), "--bn-ratio": `${L.width}/${L.height}`, "--bn-gap": `${L.gap}px`, "--bn-side-t": L.tablet.side, "--bn-wide-t": L.tablet.wide } as CSSProperties;

function BannerCard({ banner: b }: { banner: HomeBanner }) {
  const hasText = !!(b.heading || b.paragraph);
  return (
    <article className={`hp-bn s${b.slot}${hasText ? " has-text" : ""}`} style={{ "--i": b.slot - 1, "--ar-m": L.mobile[b.slot - 1] } as CSSProperties} aria-hidden={!hasText && !b.imageUrl ? true : undefined}>
      {b.imageUrl
        ? <img src={cdn(b.imageUrl, 960)} srcSet={WIDTHS.map((w) => `${cdn(b.imageUrl, w)} ${w}w`).join(", ")} sizes="(max-width: 599px) 100vw, (max-width: 899px) 60vw, 640px" alt={hasText ? "" : "Promotional offer"} loading="lazy" decoding="async" />
        : <LuPawPrint className="hp-bn-paw" aria-hidden="true" />}
      {hasText && (
        <div className="hp-bn-text">
          {b.heading && <h2>{b.heading}</h2>}
          {b.paragraph && <p>{b.paragraph}</p>}
        </div>
      )}
    </article>
  );
}

/** Fixed four-position mosaic. Empty positions keep their place so the layout never changes. */
export function PromoMosaic({ banners }: { banners: HomeBanner[] }) {
  const ref = useRef<HTMLElement>(null);
  useReveal(ref);
  return (
    <section ref={ref} className="hp-sec" data-section="promo" aria-label="Promotions">
      <div className="hp-wrap hp-promo">
        <div className="hp-grid" style={GRID}>{banners.map((b) => <BannerCard key={b.slot} banner={b} />)}</div>
      </div>
    </section>
  );
}
