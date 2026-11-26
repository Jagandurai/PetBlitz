"use client";
import { TouchEvent, useCallback, useEffect, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiMaximize2, FiX } from "react-icons/fi";
import { Img } from "./ui";
import { Media } from "./types";
import { cdn } from "@/lib/ui/store";

/** Thumbnails + hover zoom (desktop) + full-screen lightbox with keyboard arrows. */
export default function Gallery({ media, alt, badge }: { media: Media[]; alt: string; badge?: string }) {
  const imgs = media.filter((m) => m.kind === "image");
  const start = Math.max(0, imgs.findIndex((m) => m.isPrimary));
  const [i, setI] = useState(start), [zoom, setZoom] = useState<{ x: number; y: number } | null>(null), [lb, setLb] = useState(false);
  const go = useCallback((d: number) => setI((c) => (c + d + imgs.length) % Math.max(1, imgs.length)), [imgs.length]);
  useEffect(() => { if (!lb) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setLb(false); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }; window.addEventListener("keydown", k); document.body.style.overflow = "hidden"; return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; }; }, [lb, go]);
  const cur = imgs[i];
  // swipe left/right on touch screens; a swipe must not also count as a tap that opens the viewer
  const from = useRef<{ x: number; y: number } | null>(null), swiped = useRef(false);
  const swipe = {
    onTouchStart: (e: TouchEvent) => { swiped.current = false; from.current = e.touches.length === 1 ? { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY } : null; },
    onTouchEnd: (e: TouchEvent) => {
      const a = from.current, b = e.changedTouches[0];
      if (!a || !b || imgs.length < 2) return;
      const dx = b.clientX - a.x;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(b.clientY - a.y)) { swiped.current = true; go(dx < 0 ? 1 : -1); }
    },
  };
  return (
    <div className={`sf-gal${imgs.length > 1 ? "" : " single"}`}>
      {imgs.length > 1 && <div className="sf-gth" role="tablist" aria-label="Product images">{imgs.map((m, n) => <button key={m.url} role="tab" aria-selected={n === i} aria-label={`Image ${n + 1}`} className={n === i ? "on" : ""} onMouseEnter={() => setI(n)} onClick={() => setI(n)}><Img src={m.url} alt="" w={160} /></button>)}</div>}
      <div className="sf-gmain" {...swipe} onClick={() => cur && !swiped.current && setLb(true)} onPointerMove={(e) => { if (e.pointerType !== "mouse") return; const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }} onPointerLeave={() => setZoom(null)} role="button" tabIndex={0} aria-label="Open image full screen" onKeyDown={(e) => e.key === "Enter" && setLb(true)}>
        <Img src={cur?.url} alt={cur?.alt || alt} w={900} eager />
        {cur && zoom && <div className="zoomed" style={{ backgroundImage: `url(${cdn(cur.url, 1600)})`, backgroundPosition: `${zoom.x}% ${zoom.y}%`, opacity: 1 }} />}
        {badge && <span className="sf-tag pd-badge">{badge}</span>}
        {cur && <span className="pd-hint" aria-hidden="true"><FiMaximize2 /></span>}
        {imgs.length > 1 && <span className="pd-dots" aria-hidden="true">{imgs.map((m, n) => <i key={m.url} className={n === i ? "on" : ""} />)}</span>}
      </div>
      {lb && cur && <div className="sf-lb" {...swipe} role="dialog" aria-modal="true" aria-label="Image viewer" onClick={() => !swiped.current && setLb(false)}>
        <button aria-label="Close" onClick={() => setLb(false)}><FiX size={22} /></button>
        {imgs.length > 1 && <button className="nv" aria-label="Previous image" onClick={(e) => { e.stopPropagation(); go(-1); }}><FiChevronLeft size={24} /></button>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cdn(cur.url, 1600)} alt={cur.alt || alt} onClick={(e) => e.stopPropagation()} />
        {imgs.length > 1 && <button className="nv r" aria-label="Next image" onClick={(e) => { e.stopPropagation(); go(1); }}><FiChevronRight size={24} /></button>}
      </div>}
    </div>
  );
}
