"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";

type Spring = { x: number; v: number };

export function BiscuitHero() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const $ = <T extends HTMLElement>(id: string) => host.querySelector<T>("#" + id)!;
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const wrap = $("bh-wrap"), stage = $("bh-stage"), pup = $("bh-pup"), head = $("bh-head"), body = $("bh-body"), tail = $("bh-tail");
    const eL = $("bh-earL"), eR = $("bh-earR"), floor = $("bh-floor"), bub = $("bh-bubble");
    const eyes = [$("bh-eyeL"), $("bh-eyeR")];
    const irises = eyes.map((e) => e.querySelector<HTMLElement>(".iris")!);
    const lids = eyes.map((e) => e.querySelector<HTMLElement>(".lid")!);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let S = 1;
    const fit = () => {
      S = Math.min(wrap.clientWidth / 720, wrap.clientHeight / 740);
      stage.style.transform = `translate(${-320 * S}px,${-370 * S}px) scale(${S})`;
    };
    addEventListener("resize", fit);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const P = { x: innerWidth * 0.3, y: innerHeight * 0.45, t: -1e9 };
    const move = (e: PointerEvent) => { P.x = e.clientX; P.y = e.clientY; P.t = performance.now(); };
    addEventListener("pointermove", move, { passive: true });
    addEventListener("pointerdown", move, { passive: true });

    const sp = (): Spring => ({ x: 0, v: 0 });
    const hX = sp(), hY = sp(), hR = sp(), eLs = sp(), eRs = sp();
    const eyeX = [sp(), sp()], eyeY = [sp(), sp()];
    const step = (o: Spring, t: number, dt: number, k: number, c: number) => { o.v += ((t - o.x) * k - o.v * c) * dt; o.x += o.v * dt; };

    let ex = 0, bark = -1, blink = -1, nextBlink = 1500, hover = false, last = performance.now(), prevHX = 0, raf = 0;
    const enter = () => { hover = true; };
    const leave = () => { hover = false; };
    wrap.addEventListener("pointerenter", enter);
    wrap.addEventListener("pointerleave", leave);

    const woof = () => {
      bark = performance.now();
      eLs.v -= 120; eRs.v -= 120;
      bub.animate(
        [
          { opacity: 0, transform: "scale(.3) rotate(-8deg)" },
          { opacity: 1, transform: "scale(1.15) rotate(4deg)", offset: 0.25 },
          { opacity: 1, transform: "scale(1) rotate(0)", offset: 0.7 },
          { opacity: 0, transform: "scale(.9) translateY(-14px)" },
        ],
        { duration: 1100, easing: "ease-out" },
      );
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); woof(); } };
    wrap.addEventListener("click", woof);
    wrap.addEventListener("keydown", key);

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      const t = now / 1000;
      const r = stage.getBoundingClientRect();
      const cx = r.left + (77 + 215) * S, cy = r.top + (108 + 150) * S;
      const idle = reduce || now - P.t > 3500;
      let px = P.x, py = P.y;
      if (idle && !reduce) { px = cx + Math.sin(t * 0.55) * innerWidth * 0.28 + 60; py = cy + Math.sin(t * 0.37 + 1) * innerHeight * 0.12; }
      else if (idle) { px = cx; py = cy + 40 * S; }
      const nx = clamp((px - cx) / (innerWidth * 0.42), -1, 1), ny = clamp((py - cy) / (innerHeight * 0.42), -1, 1);
      const near = Math.hypot(P.x - cx, P.y - cy) < 300 * S && !idle;
      ex += (((near || hover || now - bark < 1400) ? 1 : 0) - ex) * Math.min(1, dt * 4);
      let hop = 0, squash = 0;
      if (bark > 0) { const p = (now - bark) / 460; if (p < 1) { hop = Math.sin(p * Math.PI) * 26; squash = Math.sin(p * Math.PI) * 0.03; } }
      const k = reduce ? 0.35 : 1;
      step(hX, nx * 16 * k, dt, 70, 11);
      step(hY, ny * 9 * k + (bark > 0 && now - bark < 300 ? -6 : 0), dt, 70, 11);
      step(hR, nx * 5.5 * k + (bark > 0 && now - bark < 200 ? -5 : 0), dt, 70, 11);
      const vx = (hX.x - prevHX) / Math.max(dt, 0.001); prevHX = hX.x;
      const sway = reduce ? 0 : Math.sin(t * 1.4) * 1.2;
      step(eLs, sway + vx * 0.05 + (bark > 0 && now - bark < 500 ? Math.sin((now - bark) / 45) * 5 : 0), dt, 170, 10);
      step(eRs, -sway + vx * 0.05 + (bark > 0 && now - bark < 500 ? Math.sin((now - bark) / 45 + 1) * 5 : 0), dt, 170, 10);
      head.style.transform = `translate(${hX.x}px,${hY.x - hop * 0.4}px) rotate(${hR.x}deg)`;
      eL.style.transform = `rotate(${eLs.x}deg)`;
      eR.style.transform = `rotate(${eRs.x}deg)`;
      body.style.transform = `translateX(${hX.x * 0.16}px) scale(1,${1 + Math.sin(t * 2.1) * 0.008 * k - squash})`;
      pup.style.transform = `translateY(${-hop}px)`;
      floor.style.transform = `scale(${1 - hop * 0.012})`;
      floor.style.opacity = String(1 - hop * 0.01);
      const sp2 = 4 + ex * 10, amp = (7 + ex * 16) * k;
      tail.style.transform = `rotate(${Math.sin(t * sp2) * amp - hX.x * 0.2}deg)`;
      eyes.forEach((el, i) => {
        const b = el.getBoundingClientRect(), ex_ = b.left + b.width / 2, ey = b.top + b.height / 2;
        const dx = px - ex_, dy = py - ey, d = Math.hypot(dx, dy) || 1, m = Math.min(d / (180 * S), 1) * 7.5;
        step(eyeX[i], (dx / d) * m, dt, 260, 22);
        step(eyeY[i], (dy / d) * m * 0.8, dt, 260, 22);
        irises[i].style.transform = `translate(${eyeX[i].x}px,${eyeY[i].x}px)`;
      });
      if (blink < 0 && now > nextBlink) blink = now;
      if (blink > 0) {
        const p = (now - blink) / 190;
        if (p >= 1) { blink = -1; nextBlink = now + 2200 + Math.random() * 3200; lids.forEach((l) => (l.style.transform = "translateY(-104%)")); }
        else { const o = -104 + 104 * Math.sin(p * Math.PI); lids.forEach((l) => (l.style.transform = `translateY(${o}%)`)); }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      removeEventListener("resize", fit);
      removeEventListener("pointermove", move);
      removeEventListener("pointerdown", move);
      wrap.removeEventListener("pointerenter", enter);
      wrap.removeEventListener("pointerleave", leave);
      wrap.removeEventListener("click", woof);
      wrap.removeEventListener("keydown", key);
    };
  }, []);

  return (
    <section className="bh" ref={root}>
      <div className="bh-deco" aria-hidden="true">
        <div className="bh-word">PETBLITZ</div>
        <div className="bh-trail">
          {Array.from({ length: 5 }, (_, i) => (
            <svg key={i} className={i % 2 ? "paw odd" : "paw"} viewBox="0 0 64 64" style={{ left: `${i * 18}%` }}>
              <ellipse cx="32" cy="42" rx="14" ry="12" /><ellipse cx="14" cy="26" rx="6" ry="8" /><ellipse cx="25" cy="14" rx="6" ry="8" /><ellipse cx="39" cy="14" rx="6" ry="8" /><ellipse cx="50" cy="26" rx="6" ry="8" />
            </svg>
          ))}
        </div>
      </div>
      <div className="copy">
        <h1>Say hello to Biscuit.</h1>
        <p>Biscuit is a very good boy who never loses track of you. Move your cursor and watch him follow along. Click him for a woof.</p>
        <div className="bh-row"><Link className="bh-btn" href="/dogs">Adopt a friend</Link><Link className="bh-btn alt" href="/cats">Meet the pack</Link></div>
      </div>
      <div className="wrap" id="bh-wrap" tabIndex={0} role="img" aria-label="Biscuit the puppy. His eyes follow your cursor; click or press Enter for a woof.">
        <div className="blob" />
        <div className="stage" id="bh-stage"><div className="pup" id="bh-pup">
          <div className="floor" id="bh-floor" />
          {/* eslint-disable @next/next/no-img-element */}
          <img id="bh-tail" src="/biscuit/tail.webp" alt="" />
          <img id="bh-body" src="/biscuit/body.webp" alt="" />
          <div className="head" id="bh-head">
            <img className="hd" src="/biscuit/hd.webp" alt="" />
            <div className="eye" id="bh-eyeL" style={{ left: 140, top: 106, width: 72, height: 72 }}><img className="iris" src="/biscuit/iris.webp" alt="" /><div className="lid" /></div>
            <div className="eye" id="bh-eyeR" style={{ left: 253, top: 104, width: 72, height: 72 }}><img className="iris" src="/biscuit/iris.webp" alt="" /><div className="lid" /></div>
            <img id="bh-earL" src="/biscuit/earL.webp" alt="" /><img id="bh-earR" src="/biscuit/earR.webp" alt="" />
          </div>
          {/* eslint-enable @next/next/no-img-element */}
        </div>
        <div className="bubble" id="bh-bubble">Woof!</div>
        </div>
      </div>
    </section>
  );
}
