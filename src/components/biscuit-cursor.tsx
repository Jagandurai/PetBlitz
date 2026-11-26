"use client";
import { RefObject, useEffect, useRef } from "react";

const MAX_TILT = 15;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const PAW = "M32 30c8 0 14 7 14 13 0 5-5 6-8 5-2-.7-4-1.2-6-1.2s-4 .5-6 1.2c-3 1-8 0-8-5 0-6 6-13 14-13ZM13 20a5.5 7 0 1 0 .1 0ZM24 8a5.5 7 0 1 0 .1 0ZM40 8a5.5 7 0 1 0 .1 0ZM51 20a5.5 7 0 1 0 .1 0Z";
const BONE = "M24 14C23 3 4 3 5 16c0 4 2 6 4 8-3 2-5 5-4 10 1 12 19 12 20 1h30c1 11 20 11 21-1 1-5-1-8-4-10 2-2 4-4 4-8 1-13-18-13-19-2Z";

/**
 * Decorative dog-biscuit pointer for the home hero only. It draws the bone and nothing else:
 * Biscuit's own tracking (in biscuit-hero.tsx) reads the real pointer and is not involved here.
 * Mouse/trackpad only; buttons and links keep the normal system cursor.
 */
export function BoneCursor({ host }: { host: RefObject<HTMLElement | null> }) {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = host.current, root = layer.current;
    if (!hero || !root) return;
    const bone = root.querySelector<HTMLElement>(".bh-cursor")!, tilt = root.querySelector<HTMLElement>(".bh-cursor-tilt")!, art = root.querySelector<SVGElement>(".bh-cursor-art")!;
    const fine = matchMedia("(hover: hover) and (pointer: fine)"), calm = matchMedia("(prefers-reduced-motion: reduce)");

    let x = 0, y = 0, lastX: number | null = null, angle = 0, target = 0, raf = 0, lastBurst = 0;
    const particles = new Set<HTMLElement>();

    const place = () => {
      const r = hero.getBoundingClientRect();
      bone.style.transform = `translate3d(${x - r.left}px,${y - r.top}px,0)`;
    };
    const spin = () => {
      angle += (target - angle) * 0.18;
      target *= 0.86;
      if (Math.abs(angle) < 0.1 && Math.abs(target) < 0.1) { angle = target = 0; raf = 0; } else raf = requestAnimationFrame(spin);
      tilt.style.transform = `rotate(${angle}deg)`;
    };
    const hide = () => {
      hero.classList.remove("bone-on");
      root.classList.remove("on", "over");
      art.getAnimations().forEach((a) => a.cancel());
      cancelAnimationFrame(raf);
      raf = 0; angle = target = 0; lastX = null;
      tilt.style.transform = "";
    };
    const show = (el: Element | null) => {
      if (!el || el.closest("a,button,input,select,textarea,label,[role=button]")) return hide();
      hero.classList.add("bone-on");
      root.classList.add("on");
      root.classList.toggle("over", !!el.closest("#bh-wrap"));
    };

    // position is written straight from the event so the bone never trails the real pointer
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !fine.matches) return hide();
      const dx = lastX === null ? 0 : e.clientX - lastX;
      x = e.clientX; y = e.clientY;
      place();
      show(e.target as Element);
      lastX = x;
      if (dx && !calm.matches && root.classList.contains("on")) {
        target = clamp(dx * 1.4, -MAX_TILT, MAX_TILT);
        if (!raf) raf = requestAnimationFrame(spin);
      }
    };
    const press = (e: PointerEvent) => {
      if (calm.matches || !root.classList.contains("over") || e.button !== 0) return;
      art.getAnimations().forEach((a) => a.cancel());
      art.animate([{ transform: "scale(1)" }, { transform: "scale(.86)", offset: 0.3 }, { transform: "scale(1.07)", offset: 0.65 }, { transform: "scale(1)" }], { duration: 340, easing: "ease-out" });
      const now = performance.now();
      if (now - lastBurst < 450 || particles.size > 3) return; // rapid clicking never piles particles up
      lastBurst = now;
      const r = hero.getBoundingClientRect();
      [[-30, -26, -28], [4, -40, 6], [32, -22, 30]].forEach(([dx, dy, turn], i) => {
        const p = document.createElement("span");
        p.className = "bh-puff";
        p.style.left = `${e.clientX - r.left}px`;
        p.style.top = `${e.clientY - r.top}px`;
        p.innerHTML = `<svg viewBox="0 0 64 56"><path d="${PAW}"/></svg>`;
        root.appendChild(p);
        particles.add(p);
        const run = p.animate(
          [{ opacity: 0, transform: "translate(0,0) scale(.4)" }, { opacity: 0.95, offset: 0.25 }, { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(1) rotate(${turn}deg)` }],
          { duration: 600, delay: i * 40, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" },
        );
        run.onfinish = () => { p.remove(); particles.delete(p); };
      });
    };
    // scrolling moves the hero under a still mouse, so re-check what is under the pointer
    const scroll = () => {
      if (!root.classList.contains("on")) return;
      const el = document.elementFromPoint(x, y);
      if (!el || !hero.contains(el)) return hide();
      place(); show(el);
    };

    hero.addEventListener("pointerenter", move);
    hero.addEventListener("pointermove", move, { passive: true });
    hero.addEventListener("pointerleave", hide);
    hero.addEventListener("pointercancel", hide);
    hero.addEventListener("pointerdown", press);
    addEventListener("scroll", scroll, { passive: true });
    addEventListener("blur", hide);
    fine.addEventListener("change", hide);
    return () => {
      hide();
      particles.forEach((p) => p.remove());
      hero.removeEventListener("pointerenter", move);
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", hide);
      hero.removeEventListener("pointercancel", hide);
      hero.removeEventListener("pointerdown", press);
      removeEventListener("scroll", scroll);
      removeEventListener("blur", hide);
      fine.removeEventListener("change", hide);
    };
  }, [host]);

  return (
    <div className="bh-cursor-layer" ref={layer} aria-hidden="true">
      <div className="bh-cursor">
        <div className="bh-cursor-tilt">
          <div className="bh-cursor-size">
            <svg className="bh-cursor-art" viewBox="0 0 80 52" width="40" height="26">
              <defs>
                <linearGradient id="bh-biscuit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FFE1AD" /><stop offset=".45" stopColor="#E8BD80" /><stop offset="1" stopColor="#CE9753" />
                </linearGradient>
              </defs>
              <path d={BONE} fill="url(#bh-biscuit)" stroke="#B77A3C" strokeWidth="3" strokeLinejoin="round" />
              <path d={BONE} fill="none" stroke="#D59F5B" strokeWidth="2" opacity=".75" transform="translate(5 3.3) scale(.875)" />
              <path d="M9 14C10 7 19 7 20.500 15.500C21 18 24 19 27 19H53C56 19 59 18 59.500 15.500C61 7 70 7 71 13" fill="none" stroke="#FFF1D2" strokeWidth="2.4" strokeLinecap="round" opacity=".9" />
              <g transform="translate(29.600 17.600) scale(.325)"><path d={PAW} fill="#FFE6BC" transform="translate(0 4)" /><path d={PAW} fill="#B68A55" /></g>
              <g fill="#B77A3C" opacity=".55"><circle cx="15" cy="17" r="1.1" /><circle cx="18" cy="36" r="1.2" /><circle cx="12" cy="31" r=".8" /><circle cx="65" cy="18" r="1.1" /><circle cx="62" cy="36" r="1.2" /><circle cx="68" cy="31" r=".8" /><circle cx="26" cy="28" r=".9" /><circle cx="54" cy="25" r=".9" /></g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
