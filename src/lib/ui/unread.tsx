"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "./api";

const SEEN = "pb:seen";
const EVERY_MS = 30_000;
const NONE: { orders: number; tickets: number; reviews?: number } = { orders: 0, tickets: 0 };

/** Unread counts, refreshed on page changes, when the tab regains focus, after something is opened, and every 30 s while visible. */
export function useUnread(url: string | null, { background = false }: { background?: boolean } = {}) {
  const [counts, setCounts] = useState(NONE);
  const path = usePathname();
  useEffect(() => {
    if (!url) { setCounts(NONE); return; }
    let live = true;
    const load = () => {
      if (document.hidden && !background) return;
      api<typeof NONE>(url, { sessionProbe: true }).then((c) => { if (live) setCounts(c); }).catch(() => undefined); // a missed refresh is not worth an error message
    };
    load();
    const timer = window.setInterval(load, EVERY_MS);
    window.addEventListener(SEEN, load);
    window.addEventListener("focus", load);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener(SEEN, load); window.removeEventListener("focus", load); };
  }, [url, path, background]);
  return counts;
}

/** Call on a detail page: once its record has loaded (the server then marks it read), the badges refresh. */
export function useSeen(loaded: unknown) {
  useEffect(() => { if (loaded) window.dispatchEvent(new Event(SEEN)); }, [loaded]);
}

/** Shows the count in the browser tab, e.g. "(2) PetBlitz", so it is visible while another browser tab is open. */
export function useTitleCount(n: number) {
  useEffect(() => {
    const apply = () => {
      const plain = document.title.replace(/^\(\d+\+?\) /, "");
      const next = n > 0 ? `(${n > 99 ? "99+" : n}) ${plain}` : plain;
      if (document.title !== next) document.title = next;
    };
    apply();
    const watch = new MutationObserver(apply); // page changes replace the title
    watch.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => watch.disconnect();
  }, [n]);
}

export const CountBadge = ({ n }: { n?: number }) => (n ? <span className="ntf-count" aria-label={`${n} new`}>{n > 99 ? "99+" : n}</span> : null);
