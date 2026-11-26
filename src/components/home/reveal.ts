"use client";
import { RefObject, useEffect } from "react";

/** Scroll entrance. Content is visible by default; "wait" is only added when JS can later reveal it. */
export function useReveal(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window) || el.getBoundingClientRect().top < innerHeight * 0.9) return;
    el.classList.add("hp-wait");
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { el.classList.remove("hp-wait"); io.disconnect(); } }, { threshold: 0.08 });
    io.observe(el);
    return () => { io.disconnect(); el.classList.remove("hp-wait"); };
  });
}
