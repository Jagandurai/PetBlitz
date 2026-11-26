"use client";
import { useRouter } from "next/navigation";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, errText } from "./api";
import { cdn } from "./cdn";
import { useAuth, useToast } from "./hooks";

export { cdn };
export const pctOff = (price: number, final: number) => (price > 0 && final < price ? Math.round(((price - final) / price) * 100) : 0);

export interface WishItem { kind: "products"; id: string; slug: string }
export interface Recent { kind: "products"; id: string; slug: string; name: string; image?: string; price: number; final: number }
interface StoreState {
  wish: WishItem[]; toggleWish: (w: WishItem, opts?: { silent?: boolean }) => void; isWished: (id: string) => boolean;
  recent: Recent[]; pushRecent: (r: Recent) => void;
  cartOpen: boolean; openCart: () => void; closeCart: () => void;
  wishOpen: boolean; openWish: () => void; closeWish: () => void;
  /** The product most recently added to the cart, listed first in the cart drawer. */
  lastAdded: string | null;
  addToCart: (a: { id: string; quantity?: number }, opts?: { open?: boolean; next?: string }) => Promise<boolean>;
}
const RECENT_LIMIT = 20;
const Ctx = createContext<StoreState | null>(null);
export const useStore = () => { const c = useContext(Ctx); if (!c) throw new Error("StoreProvider missing"); return c; };

const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode / quota: wishlist is best-effort */ } };

/**
 * Which saved products can no longer be shown (so they must not be counted), and which have a new web address.
 * Only a successful answer from the server removes anything: if a check fails, those entries are kept.
 */
async function unavailable(saved: WishItem[]) {
  const gone = new Set<string>(), slugs = new Map<string, string>();
  const valid = saved.filter((x) => /^[a-f\d]{24}$/i.test(x.id));
  for (const x of saved) if (!valid.includes(x)) gone.add(x.id);
  for (let i = 0; i < valid.length; i += 20) { // the endpoint takes 20 at a time
    const batch = valid.slice(i, i + 20);
    try {
      const { items } = await api<{ items: { id: string; slug: string }[] }>(`/api/homepage/products?ids=${batch.map((x) => x.id).join(",")}`);
      const found = new Map(items.map((p) => [p.id, p.slug]));
      for (const x of batch) {
        const slug = found.get(x.id);
        if (slug === undefined) gone.add(x.id);
        else if (slug !== x.slug) slugs.set(x.id, slug);
      }
    } catch { /* offline or busy: try again on the next visit */ }
  }
  return { gone, slugs };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { me, loading: authLoading, refreshCart } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [wish, setWish] = useState<WishItem[]>([]), [recent, setRecent] = useState<Recent[]>([]), [cartOpen, setCartOpen] = useState(false);
  const [wishOpen, setWishOpen] = useState(false), [lastAdded, setLastAdded] = useState<string | null>(null);
  // only one drawer is ever open
  const openCart = useCallback(() => { setWishOpen(false); setCartOpen(true); }, []);
  const openWish = useCallback(() => { setCartOpen(false); setWishOpen(true); }, []);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const closeWish = useCallback(() => setWishOpen(false), []);
  // entries saved by older versions for anything other than products are dropped
  useEffect(() => {
    const saved = read<WishItem[]>("pb_wish", []).filter((x) => x.kind === "products");
    setWish(saved);
    void unavailable(saved).then(({ gone, slugs }) => {
      if (!gone.size && !slugs.size) return;
      // applied to the latest list, so anything saved while checking is kept
      const next = read<WishItem[]>("pb_wish", []).filter((x) => x.kind === "products" && !gone.has(x.id)).map((x) => ({ ...x, slug: slugs.get(x.id) ?? x.slug }));
      write("pb_wish", next);
      setWish(next);
    });
  }, []);
  // history is only touched once we know who is signed in, so a customer's views are never filed under the guest or another account
  const historyKey = authLoading ? null : me ? `pb_recent:${me.id}` : "pb_recent";
  const keyRef = useRef<string | null>(null), pending = useRef<Recent[]>([]);
  const addRecent = (list: Recent[], r: Recent) => [r, ...list.filter((x) => x.id !== r.id)].slice(0, RECENT_LIMIT);
  useEffect(() => {
    keyRef.current = historyKey;
    if (!historyKey) return;
    const stored = read<Recent[]>(historyKey, []).filter((x) => x.kind === "products");
    const next = pending.current.reduce(addRecent, stored);
    if (pending.current.length) write(historyKey, next);
    pending.current = [];
    setRecent(next);
  }, [historyKey]);
  const toggleWish = useCallback((w: WishItem, opts: { silent?: boolean } = {}) => {
    const adding = !wish.some((x) => x.id === w.id);
    const next = adding ? [w, ...wish].slice(0, 60) : wish.filter((x) => x.id !== w.id);
    write("pb_wish", next);
    setWish(next);
    if (opts.silent) return;
    toast(adding ? "Added to wishlist" : "Removed from wishlist", "ok");
    if (adding) openWish();
  }, [wish, toast, openWish]);
  const pushRecent = useCallback((r: Recent) => {
    const key = keyRef.current;
    if (!key) { pending.current.push(r); return; }
    const next = addRecent(read<Recent[]>(key, []), r);
    write(key, next);
    setRecent(next);
  }, []);
  const isWished = useCallback((id: string) => wish.some((w) => w.id === id), [wish]);
  const addToCart = useCallback(async (a: { id: string; quantity?: number }, opts: { open?: boolean; next?: string } = {}) => {
    if (!me) { router.push(`/login?next=${encodeURIComponent(opts.next ?? window.location.pathname + window.location.search)}`); return false; }
    try {
      await api("/api/me/cart/items", { method: "POST", body: { itemType: "product", productId: a.id, quantity: a.quantity ?? 1 } });
      await refreshCart();
      setLastAdded(a.id);
      toast("Added to cart", "ok");
      if (opts.open !== false) openCart();
      return true;
    } catch (e) { toast(errText(e), "err"); return false; }
  }, [me, refreshCart, router, toast, openCart]);
  const value = useMemo<StoreState>(() => ({ wish, toggleWish, isWished, recent, pushRecent, cartOpen, openCart, closeCart, wishOpen, openWish, closeWish, lastAdded, addToCart }), [wish, toggleWish, isWished, recent, pushRecent, cartOpen, openCart, closeCart, wishOpen, openWish, closeWish, lastAdded, addToCart]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Locks page scroll while a drawer/modal is open. */
export function ScrollLock() {
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);
  return null;
}
