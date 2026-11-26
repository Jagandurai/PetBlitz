"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import {
  LuArrowRight, LuBath, LuChevronDown, LuDroplets, LuHeart, LuHouse, LuLayoutGrid, LuLoaderCircle, LuMenu,
  LuPawPrint, LuSearch, LuShirt, LuShoppingBag, LuSparkles, LuTag, LuToyBrick, LuTruck, LuUserRound, LuBox,
} from "react-icons/lu";
import { Qty } from "./ui";
import { homeCategories } from "@/components/home/categories";
import type { HomeCategory } from "@/components/home/types";
import { CartData, CatNode, ProductData, PublicSettings, catHref } from "./types";
import { api, qs } from "@/lib/ui/api";
import { inr } from "@/lib/ui/format";
import { useDebounced } from "@/components/ui";
import { useApi, useAuth } from "@/lib/ui/hooks";
import { useUnread } from "@/lib/ui/unread";
import { ScrollLock, cdn, useStore } from "@/lib/ui/store";

const primary = (m: { kind: string; url: string; isPrimary?: boolean }[]) => (m.find((x) => x.isPrimary) ?? m.find((x) => x.kind === "image"))?.url;
const badge = (n: number) => (n > 99 ? "99+" : n);

// ------------------------------------------------------------------ search with suggestions
type Suggest = { state: "idle" | "loading" | "done" | "error"; q: string; items: ProductData[] };

/** Pages that list search results: there the box filters the list as you type, and emptying it clears the search. */
const RESULT_PAGES = ["/search", "/products"];

function SearchBox({ tree, params = "" }: { tree: CatNode[]; params?: string }) {
  const router = useRouter(), path = usePathname();
  const live = RESULT_PAGES.includes(path);
  const urlQ = live ? new URLSearchParams(params).get("q") ?? "" : "";
  const [q, setQ] = useState(urlQ), [open, setOpen] = useState(false), [idx, setIdx] = useState(-1);
  const dq = useDebounced(q.trim(), 250);
  /** `sent` is the search the address bar has; `typing` is true only for changes made by the shopper in this box. */
  const sent = useRef(urlQ), typing = useRef(false);
  const change = (v: string) => { typing.current = true; setQ(v); setIdx(-1); };
  const apply = (term: string) => {
    typing.current = false;
    if (!live || term === sent.current) return;
    sent.current = term;
    if (path === "/search") { router.replace(term ? `/search?q=${encodeURIComponent(term)}` : "/products", { scroll: false }); return; }
    const n = new URLSearchParams(params);
    if (term) n.set("q", term); else n.delete("q");
    n.delete("page");
    router.replace(`/products${n.size ? `?${n}` : ""}`, { scroll: false });
  };
  // the address changed some other way (a link, "Clear all", back/forward): show what it says
  useEffect(() => { if (urlQ !== sent.current) { sent.current = urlQ; typing.current = false; setQ(urlQ); } }, [urlQ]);
  // arriving on a results page from elsewhere: leftover text must not suggest a filter that is not applied
  const wasLive = useRef(live);
  useEffect(() => { if (live && !wasLive.current) { typing.current = false; setQ(urlQ); } wasLive.current = live; }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (typing.current && dq === q.trim()) apply(dq); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  // emptying the box clears the results at once, without waiting
  useEffect(() => { if (typing.current && !q.trim()) apply(""); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const [res, setRes] = useState<Suggest>({ state: "idle", q: "", items: [] });
  const box = useRef<HTMLFormElement>(null);
  useEffect(() => {
    setIdx(-1);
    if (dq.length < 2) { setRes({ state: "idle", q: "", items: [] }); return; }
    const ac = new AbortController();
    setRes((r) => ({ ...r, state: "loading" }));
    api<{ items: ProductData[] }>(`/api/products${qs({ q: dq, pageSize: 5 })}`, { signal: ac.signal })
      .then((p) => setRes({ state: "done", q: dq, items: p.items }))
      .catch((e) => { if ((e as Error).name !== "AbortError") setRes({ state: "error", q: dq, items: [] }); });
    return () => ac.abort();
  }, [dq]);
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  useEffect(() => { setOpen(false); }, [path]);
  const cats = useMemo(() => { const out: CatNode[] = []; const walk = (n: CatNode[]) => n.forEach((c) => { if (dq.length >= 2 && c.name.toLowerCase().includes(dq.toLowerCase())) out.push(c); walk(c.children); }); walk(tree); return out.slice(0, 4); }, [tree, dq]);

  const typed = q.trim();
  const busy = typed.length >= 2 && (typed !== dq || res.state === "loading" || res.state === "idle");
  const items = !busy && res.state === "done" ? res.items : [];
  const shownCats = busy ? [] : cats;
  const links = [...shownCats.map((c) => catHref(c)), ...items.map((p) => `/products/${p.slug}`)];
  const show = open && !live && typed.length >= 2;
  const close = () => { setOpen(false); (document.activeElement as HTMLElement | null)?.blur(); };
  const submit = (e: React.FormEvent) => { e.preventDefault(); const sel = show ? links[idx] : undefined; close(); if (live) { apply(typed); return; } router.push(sel ?? (typed ? `/search?q=${encodeURIComponent(typed)}` : "/products")); };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setIdx((i) => Math.min(links.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(-1, i - 1)); }
    else if (e.key === "Escape") setOpen(false);
  };
  const option = (i: number, href: string, media: ReactNode, title: string, sub?: string, price?: string) => (
    <Link key={`${i}-${href}`} id={`nv-opt-${i}`} role="option" aria-selected={idx === i} tabIndex={-1} href={href} className={`nv-opt ${idx === i ? "on" : ""}`} onClick={close} onMouseEnter={() => setIdx(i)}>
      <span className="nv-thumb">{media}</span><span className="nv-opt-t"><b>{title}</b>{sub && <small>{sub}</small>}</span>{price && <span className="nv-opt-p">{price}</span>}
    </Link>
  );

  return (
    <form className={`nv-search ${show ? "open" : ""}`} role="search" onSubmit={submit} ref={box} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <LuSearch className="nv-search-ic" size={19} aria-hidden="true" />
      <input id="nv-search-input" value={q} onChange={(e) => { change(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={keys} placeholder="Search accessories, toys, brands..." aria-label="Search the store" autoComplete="off" enterKeyHint="search" role="combobox" aria-autocomplete="list" aria-controls="nv-listbox" aria-expanded={show} aria-activedescendant={show && idx >= 0 ? `nv-opt-${idx}` : undefined} />
      {q && <button type="button" className="nv-clear" aria-label="Clear search" onClick={() => { change(""); document.getElementById("nv-search-input")?.focus(); }}><FiX size={16} /></button>}
      <button type="submit" className="nv-go" aria-label="Search"><LuSearch size={18} /><span>Search</span></button>
      {show && (
        <div className="nv-sug">
          <div role="status" aria-live="polite">
            {busy && <div className="nv-state"><LuLoaderCircle className="nv-spin" size={18} /> Searching…</div>}
            {!busy && res.state === "error" && <div className="nv-state err">Suggestions are unavailable right now. Press Enter to search.</div>}
            {!busy && res.state === "done" && !links.length && <div className="nv-state">No matches for “{dq}”. Press Enter to search everything.</div>}
          </div>
          <div id="nv-listbox" role="listbox" aria-label="Search suggestions">
            {shownCats.length > 0 && <><h6>Categories</h6>{shownCats.map((c, i) => option(i, catHref(c), <LuLayoutGrid size={18} />, c.name))}</>}
            {items.length > 0 && <><h6>Products</h6>{items.map((p, i) => { const img = primary(p.media); return option(shownCats.length + i, `/products/${p.slug}`, img ? <img src={cdn(img, 96)} alt="" /> : <LuPawPrint size={18} />, p.name, p.brand, inr(p.pricing.finalPrice)); })}</>}
          </div>
          {!busy && items.length > 0 && <Link href={`/search?q=${encodeURIComponent(dq)}`} className="nv-all" onClick={close}>See all results for “{dq}” <LuArrowRight size={15} /></Link>}
        </div>
      )}
    </form>
  );
}

// ------------------------------------------------------------------ navigation + shop mega menu (categories are data-driven)
const NAV = [
  { href: "/", label: "Home", key: "home" }, { href: "/products", label: "Shop", key: "shop" }, { href: "/products?onSale=true", label: "Offers", key: "offers" },
  { href: "/about", label: "About Us", key: "about" }, { href: "/blog", label: "Blog", key: "blog" }, { href: "/contact", label: "Contact", key: "contact" },
] as const;

function activeKey(path: string, onSale: boolean) {
  if (path === "/") return "home";
  if (path.startsWith("/products")) return onSale ? "offers" : "shop";
  return NAV.find((n) => n.href !== "/" && !n.href.includes("?") && path.startsWith(n.href))?.key ?? "";
}

const CAT_ICON: Record<HomeCategory["key"], typeof LuBox> = { grooming: LuBath, toys: LuToyBrick, litter: LuBox, hygiene: LuDroplets, clothing: LuShirt };

/** The five shop categories, linked to the matching public categories in the database. */
function shopCats(tree: CatNode[]) {
  const slugs = new Set<string>();
  const walk = (nodes: CatNode[]) => nodes.forEach((c) => { slugs.add(c.slug); walk(c.children); });
  walk(tree);
  return homeCategories(slugs);
}

function MegaMenu({ tree, onNavigate }: { tree: CatNode[]; onNavigate: () => void }) {
  const cats = shopCats(tree);
  const feature = (href: string, Icon: typeof LuTag, title: string, sub: string, cls = "") => (
    <Link href={href} className={`nv-feat ${cls}`} onClick={onNavigate}><span><Icon size={19} /></span><span><b>{title}</b><small>{sub}</small></span></Link>
  );
  return (
    <div className="nv-mega" id="nv-mega">
      <div className="sf-wrap nv-mega-in">
        <div className="nv-mega-side">
          <h5>Discover</h5>
          {feature("/products", LuLayoutGrid, "All Accessories", "Browse the whole range")}
          {feature("/products?sort=newest", LuSparkles, "New Arrivals", "Just landed in store")}
          {feature("/products?onSale=true", LuTag, "Offers & Deals", "Save on favourites", "deal")}
        </div>
        <div>
          <h5>Shop by category</h5>
          <ul className="nv-cats">{cats.map((c) => { const Icon = CAT_ICON[c.key]; return (
            <li key={c.key}><Link href={c.href} className="nv-cat" onClick={onNavigate}><span className="nv-cat-ic"><Icon size={22} /></span><b>{c.name}</b><LuArrowRight className="nv-cat-go" size={16} /></Link></li>); })}</ul>
        </div>
        <Link href="/products?onSale=true" className="nv-promo" onClick={onNavigate}>
          <LuPawPrint className="nv-promo-paw" size={120} aria-hidden="true" />
          <span className="nv-promo-k">Offers &amp; deals</span><b>Treats for your wallet</b><small>See the current offers</small><span className="nv-promo-cta">Shop offers <LuArrowRight size={15} aria-hidden="true" /></span>
          <img className="nv-promo-pet" src="/images/home/profile-kitten.webp" alt="" width={720} height={422} loading="lazy" />
        </Link>
      </div>
    </div>
  );
}

function NavBar({ tree, onSale }: { tree: CatNode[]; onSale: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const active = activeKey(path, onSale);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); };
  /** Short delays stop the menu flickering when the pointer just passes over, or briefly leaves, the item. */
  const later = (v: boolean) => { cancel(); timer.current = setTimeout(() => setOpen(v), v ? 90 : 180); };
  const closeNow = () => { cancel(); setOpen(false); };
  useEffect(() => { closeNow(); }, [path, onSale]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancel(), []);
  return (
    <nav className="nv-nav" aria-label="Main">
      <ul className="sf-wrap">
        {NAV.map((n) => {
          const link = <Link href={n.href} className={`nv-link ${active === n.key ? "on" : ""} ${n.key === "offers" ? "deal" : ""}`} aria-current={active === n.key ? "page" : undefined} onClick={closeNow}>{n.label}{n.key === "offers" && <i aria-hidden="true">%</i>}</Link>;
          if (n.key !== "shop") return <li key={n.key}>{link}</li>;
          return (
            <li key={n.key} className={`nv-has-mega ${open ? "open" : ""}`} onMouseEnter={() => later(true)} onMouseLeave={() => later(false)}
              onKeyDown={(e) => { if (e.key === "Escape" && open) { closeNow(); toggleRef.current?.focus(); } }}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) later(false); }} onFocus={cancel}>
              {link}
              <button ref={toggleRef} type="button" className="nv-toggle" aria-expanded={open} aria-controls="nv-mega" aria-label="Show shop categories" onClick={() => { cancel(); setOpen((o) => !o); }}><LuChevronDown size={15} /></button>
              {open && <MegaMenu tree={tree} onNavigate={closeNow} />}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
/** useSearchParams needs a Suspense boundary so static pages can still prerender. */
function NavWithQuery({ tree }: { tree: CatNode[] }) { return <NavBar tree={tree} onSale={useSearchParams().get("onSale") === "true"} />; }
function SearchWithQuery({ tree }: { tree: CatNode[] }) { return <SearchBox tree={tree} params={useSearchParams().toString()} />; }

// ------------------------------------------------------------------ mobile menu
function MobileMenu({ tree, onClose }: { tree: CatNode[]; onClose: () => void }) {
  const { me, signOut } = useAuth();
  const router = useRouter(), path = usePathname();
  const [shop, setShop] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return; // keep keyboard focus inside the open drawer
      const f = panel.current!.querySelectorAll<HTMLElement>("a[href],button:not([disabled])");
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); opener?.focus(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <ScrollLock /><div className="sf-bg" onClick={onClose} />
      <aside ref={panel} className="sf-dr l nv-drawer" role="dialog" aria-modal="true" aria-label="Menu">
        <header><img src="/logo.webp" alt="PetBlitz" /><button className="nv-ib" aria-label="Close menu" onClick={onClose}><FiX size={22} /></button></header>
        <div className="bd">
          <nav aria-label="Main">
            {NAV.map((n) => n.key !== "shop"
              ? <Link key={n.key} href={n.href} onClick={onClose} className={`nv-m ${n.href === path ? "on" : ""} ${n.key === "offers" ? "deal" : ""}`}>{n.label}</Link>
              : <div key={n.key}>
                  <button type="button" className="nv-m" aria-expanded={shop} onClick={() => setShop(!shop)}>{n.label}<LuChevronDown size={18} style={{ transform: shop ? "rotate(180deg)" : undefined }} /></button>
                  {shop && <div className="nv-m-sub">
                    <Link href="/products" onClick={onClose}><LuLayoutGrid size={17} />All Accessories</Link>
                    {shopCats(tree).map((c) => { const Icon = CAT_ICON[c.key]; return <Link key={c.key} href={c.href} onClick={onClose}><Icon size={17} />{c.name}</Link>; })}
                    <Link href="/products?sort=newest" onClick={onClose}><LuSparkles size={17} />New Arrivals</Link>
                    <Link href="/products?onSale=true" onClick={onClose}><LuTag size={17} />Offers &amp; Deals</Link>
                  </div>}
                </div>)}
          </nav>
        </div>
        <footer>{me ? <div style={{ display: "flex", gap: 8 }}><Link className="sf-btn ghost block" href="/account" onClick={onClose}>My account</Link><button className="sf-btn ghost block" onClick={async () => { await signOut(); onClose(); router.push("/"); }}>Sign out</button></div> : <Link className="sf-btn block" href="/login" onClick={onClose}>Sign in</Link>}</footer>
      </aside>
    </>
  );
}

// ------------------------------------------------------------------ cart and wishlist drawers
/** How many of the latest items a drawer lists; the rest are behind "View all". */
const DRAWER_ITEMS = 5;

function Drawer({ label, title, onClose, footer, children }: { label: string; title: string; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); opener?.focus?.(); };
  }, [onClose]);
  return (
    <>
      <ScrollLock /><div className="sf-bg" onClick={onClose} />
      <aside className="sf-dr r" role="dialog" aria-modal="true" aria-label={label}>
        <header><b>{title}</b><button ref={close} className="sf-icon" aria-label={`Close ${label.toLowerCase()}`} onClick={onClose}><FiX size={22} /></button></header>
        <div className="bd">{children}</div>
        {footer && <footer>{footer}</footer>}
      </aside>
    </>
  );
}

const Thumb = ({ src, alt }: { src?: string; alt: string }) => <div className="sf-dthumb">{src ? <img src={cdn(src, 160)} alt={alt} /> : <LuPawPrint size={22} aria-hidden="true" />}</div>;

export function MiniCart() {
  const { cartOpen, closeCart, lastAdded } = useStore();
  const { me, refreshCart } = useAuth();
  const settings = useApi<PublicSettings>("/api/settings/public");
  const { data, reload, setData } = useApi<CartData>(cartOpen && me ? "/api/me/cart" : null);
  if (!cartOpen) return null;
  const mutate = async (fn: () => Promise<CartData>) => { try { setData(await fn()); await refreshCart(); } catch { reload(); } };
  const free = settings.data?.shipping.freeAboveMinor ?? null;
  // the cart stores lines oldest first; the one just added leads even if it was already in the cart
  const latest = [...(data?.items ?? [])].reverse().sort((a, b) => Number(b.id === lastAdded) - Number(a.id === lastAdded)).slice(0, DRAWER_ITEMS);
  const count = data?.items.length ?? 0;
  return (
    <Drawer label="Shopping cart" title={`Your cart${data && me ? ` (${data.itemCount})` : ""}`} onClose={closeCart}
      footer={!me ? <Link href="/login?next=/cart" className="sf-btn sf-dbtn block" onClick={closeCart}>Sign in</Link> : count > 0 && data ? <>
        <div className="sf-sr t" style={{ margin: 0, border: 0, paddingTop: 0 }}><span>Subtotal</span><span>{inr(data.subtotal)}</span></div>
        <p className="sf-sticky-note" style={{ margin: "2px 0 10px" }}>Shipping, GST and coupons are calculated at checkout.</p>
        <div style={{ display: "grid", gap: 8 }}><Link href="/cart" className="sf-btn sf-dbtn block" onClick={closeCart}>View all items in cart ({count})</Link><Link href="/checkout" className="sf-btn sf-dbtn ghost block" onClick={closeCart}>Checkout</Link></div>
      </> : undefined}>
      {!me ? <p className="muted center" style={{ marginTop: 40 }}>Sign in to see your cart.</p> : !data ? <p className="muted">Loading…</p> : !count ? <p className="muted center" style={{ marginTop: 40 }}>Your cart is empty.</p> : <>
        {free != null && <div className="sf-fs">{data.subtotal >= free ? <b>🎉 You get FREE shipping!</b> : <>Add <b>{inr(free - data.subtotal)}</b> more for free shipping</>}<div className="tr"><i style={{ width: `${Math.min(100, (data.subtotal / free) * 100)}%` }} /></div></div>}
        {count > DRAWER_ITEMS && <p className="sf-dnote">Showing your last {DRAWER_ITEMS} added items</p>}
        {latest.map((l) => (
          <div key={l.key} className="sf-dline">
            <Thumb src={l.image} alt={l.name} />
            <div><Link href={`/products/${l.slug}`} onClick={closeCart} className="sf-dname">{l.name}</Link>
              {l.issue && <div style={{ color: "var(--deal)", fontSize: ".8rem" }}>{l.issue}</div>}
              <div className="sf-drow"><Qty value={l.quantity} max={Math.max(1, l.maxQuantity)} onChange={(q) => mutate(() => api<CartData>(`/api/me/cart/items/${l.id}`, { method: "PATCH", body: { quantity: q } }))} /><b>{inr(l.lineTotal)}</b></div>
              <button className="sf-btn text sf-dremove" onClick={() => mutate(() => api<CartData>(`/api/me/cart/items/${l.id}`, { method: "DELETE" }))}>Remove</button></div>
          </div>))}
      </>}
    </Drawer>
  );
}

export function MiniWishlist() {
  const { wishOpen, closeWish, wish, toggleWish, isWished } = useStore();
  const [rows, setRows] = useState<ProductData[] | null>(null);
  const latest = wish.slice(0, DRAWER_ITEMS); // newest first
  const key = latest.map((w) => w.id).join(",");
  useEffect(() => {
    if (!wishOpen) { setRows(null); return; } // items un-liked last time are gone when it is reopened
    let live = true;
    Promise.allSettled(latest.map((w) => api<ProductData>(`/api/products/${w.slug}`))).then((r) => {
      if (!live) return;
      const found = r.flatMap((x) => (x.status === "fulfilled" ? [x.value] : []));
      // rows already on screen keep their place, even when un-liked, so the same heart can be clicked again
      setRows((shown) => {
        if (!shown) return found;
        const fresh = new Map(found.map((p) => [p.id, p]));
        return [...found.filter((p) => !shown.some((s) => s.id === p.id)), ...shown.map((s) => fresh.get(s.id) ?? s)];
      });
    });
    return () => { live = false; };
  }, [wishOpen, key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!wishOpen) return null;
  const empty = !wish.length && !rows?.length;
  return (
    <Drawer label="Wishlist" title={`Your wishlist (${wish.length})`} onClose={closeWish}
      footer={wish.length > 0 ? <Link href="/wishlist" className="sf-btn sf-dbtn block" onClick={closeWish}>View all wishlist items ({wish.length})</Link> : undefined}>
      {empty ? <p className="muted center" style={{ marginTop: 40 }}>Your wishlist is empty.</p> : !rows ? <p className="muted">Loading…</p> : <>
        {wish.length > DRAWER_ITEMS && <p className="sf-dnote">Showing your last {DRAWER_ITEMS} saved items</p>}
        {rows.map((p) => {
          const liked = isWished(p.id);
          return (
            <div key={p.id} className="sf-dline sf-wline">
              <Thumb src={primary(p.media)} alt={p.name} />
              <div><Link href={`/products/${p.slug}`} onClick={closeWish} className="sf-dname">{p.name}</Link>
                <div className="sf-drow"><b>{inr(p.pricing.finalPrice)}</b></div></div>
              <button type="button" className={`sf-wheart${liked ? " on" : ""}`} aria-pressed={liked} aria-label={liked ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`} title={liked ? "Remove from wishlist" : "Add to wishlist"} onClick={() => toggleWish({ kind: "products", id: p.id, slug: p.slug })}><LuHeart aria-hidden="true" /></button>
            </div>);
        })}
      </>}
    </Drawer>
  );
}

// ------------------------------------------------------------------ header
/** True once the page is scrolled. Two thresholds, so the height change of the compact header cannot make it flicker. */
function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const on = () => setCompact((c) => (c ? window.scrollY > 24 : window.scrollY > 110));
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return compact;
}

/** The signed-in customer's Google picture, or their first initial if there is none or it fails to load. */
function UserPhoto({ me, small }: { me: { avatarUrl?: string; firstName?: string; displayName?: string; email: string }; small?: boolean }) {
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <span className={`nv-photo${small ? " small" : ""}`}>
      {me.avatarUrl && broken !== me.avatarUrl
        ? <img src={me.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(me.avatarUrl!)} />
        : (me.firstName || me.displayName || me.email).charAt(0).toUpperCase()}
    </span>
  );
}

export function Header() {
  const { me, loading, cartCount } = useAuth();
  const { wish, openCart, openWish, closeCart, closeWish } = useStore();
  const settings = useApi<PublicSettings>("/api/settings/public");
  const { data } = useApi<{ tree: CatNode[] }>("/api/categories");
  const [menu, setMenu] = useState(false);
  const compact = useCompact();
  const path = usePathname();
  useEffect(() => { setMenu(false); closeCart(); closeWish(); }, [path, closeCart, closeWish]);
  /** The header icons open the drawer first; its "View all" goes to the page. On that page, or with a modifier key, they stay plain links. */
  const peek = (page: string, open: () => void) => (e: React.MouseEvent) => { if (path === page || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); open(); };
  const tree = data?.tree ?? [];
  const free = settings.data?.shipping.freeAboveMinor;
  const unread = useUnread(me ? "/api/me/notifications" : null);
  const news = unread.orders + unread.tickets;
  // with something unread, the account icon goes straight to it
  const accountHref = !me ? "/login" : unread.tickets ? "/account/support" : unread.orders ? "/account/orders" : "/account";
  const accountLabel = me ? `My account${me.firstName ? ` (${me.firstName})` : ""}${news ? `, ${news} new update${news > 1 ? "s" : ""}` : ""}` : "Sign in";
  const focusSearch = () => { window.scrollTo({ top: 0, behavior: "smooth" }); document.getElementById("nv-search-input")?.focus({ preventScroll: true }); };
  return (
    <>
      <div className="sf-ann"><LuTruck size={15} aria-hidden="true" /> {free ? <span>Free shipping on orders above <b>{inr(free)}</b></span> : <span>Quality pet essentials, delivered with care</span>}<span className="sf-ann-x"> · Instant refunds to your PetBlitz wallet</span></div>
      <header className={`sf-hdr nv ${compact ? "compact" : ""}`}>
        <div className="sf-wrap nv-top">
          <button className="nv-ib nv-burger" aria-label="Open menu" aria-haspopup="dialog" aria-expanded={menu} onClick={() => setMenu(true)}><LuMenu size={23} /></button>
          <Link href="/" className="nv-logo" aria-label="PetBlitz home"><img src="/logo.webp" alt="PetBlitz" /></Link>
          <Suspense fallback={<SearchBox tree={tree} />}><SearchWithQuery tree={tree} /></Suspense>
          <div className="nv-actions">
            <Link href={accountHref} className={`nv-ib ${me ? "signed" : ""}`} aria-label={accountLabel} data-tip={me ? "Account" : "Sign in"} aria-busy={loading}>{me ? <UserPhoto me={me} /> : <LuUserRound size={22} />}{news > 0 && <span className="nv-cnt">{badge(news)}</span>}</Link>
            <Link href="/wishlist" onClick={peek("/wishlist", openWish)} className="nv-ib" aria-label={`Wishlist, ${wish.length} saved`} data-tip="Wishlist"><LuHeart size={22} />{wish.length > 0 && <span className="nv-cnt" key={wish.length}>{badge(wish.length)}</span>}</Link>
            <Link href="/cart" onClick={peek("/cart", openCart)} className="nv-ib nv-bag" aria-label={`Cart, ${cartCount} items`} data-tip="Cart"><LuShoppingBag size={22} />{cartCount > 0 && <span className="nv-cnt" key={cartCount}>{badge(cartCount)}</span>}</Link>
          </div>
        </div>
        <Suspense fallback={<NavBar tree={tree} onSale={false} />}><NavWithQuery tree={tree} /></Suspense>
      </header>
      {menu && <MobileMenu tree={tree} onClose={() => setMenu(false)} />}
      <nav className="sf-bottom" aria-label="Quick navigation">
        <Link href="/" className={path === "/" ? "on" : ""}><LuHouse />Home</Link>
        <button onClick={() => setMenu(true)}><LuLayoutGrid />Menu</button>
        <button onClick={focusSearch}><LuSearch />Search</button>
        <Link href="/cart" onClick={peek("/cart", openCart)} className={path === "/cart" ? "on" : ""}><LuShoppingBag />Cart{cartCount > 0 && <span className="sf-cnt" style={{ right: "26%" }}>{badge(cartCount)}</span>}</Link>
        <Link href={accountHref} className={path.startsWith("/account") ? "on" : ""}>{me ? <UserPhoto me={me} small /> : <LuUserRound />}{me ? "Account" : "Sign in"}{news > 0 && <span className="sf-cnt" style={{ right: "26%" }}>{badge(news)}</span>}</Link>
      </nav>
    </>
  );
}
