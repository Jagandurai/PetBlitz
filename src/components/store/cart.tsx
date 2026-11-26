"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FiHeart, FiTag, FiTrash2 } from "react-icons/fi";
import { PriceBox } from "./summary";
import { CartData, ProductData, Quote } from "./types";
import { Crumbs, Empty, Img, Qty, Rail, SectionTitle, Skel } from "./ui";
import { ItemCard } from "./card";
import { api, errText } from "@/lib/ui/api";
import { inr } from "@/lib/ui/format";
import { useApi, useAuth, useToast } from "@/lib/ui/hooks";
import { useStore } from "@/lib/ui/store";
import "./cart.css";

export default function CartView() {
  const { me, loading: al, refreshCart } = useAuth();
  const { toggleWish, isWished } = useStore();
  const { toast } = useToast();
  const [cart, setCart] = useState<CartData | null>(null), [quote, setQuote] = useState<Quote | null>(null), [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState(""), [applied, setApplied] = useState<string | undefined>(undefined), [busy, setBusy] = useState(false);
  const pick = useApi<{ items: ProductData[] }>("/api/products?featured=true&pageSize=10");
  const load = useCallback(async (c = applied) => {
    try { const [cr, q] = await Promise.all([api<CartData>("/api/me/cart"), api<Quote>("/api/me/cart/quote", { method: "POST", body: c ? { couponCode: c } : {} })]); setCart(cr); setQuote(q); setErr(null); if (c && q.couponError) { toast(q.couponError, "err"); setApplied(undefined); } }
    catch (e) { setErr(errText(e)); }
  }, [applied, toast]);
  useEffect(() => { if (me) void load(); }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); await load(); await refreshCart(); } catch (e) { toast(errText(e), "err"); } finally { setBusy(false); } };
  if (al) return <Skel h={300} />;
  if (!me) return <Empty icon="🛒" title="Sign in to see your cart" action={<Link className="sf-btn" href="/login?next=/cart">Sign in</Link>}>Your cart is saved to your account so you can pick up on any device.</Empty>;
  if (err) return <Empty icon="⚠️" title="Couldn't load your cart" action={<button className="sf-btn" onClick={() => load()}>Try again</button>}>{err}</Empty>;
  if (!cart) return <Skel h={300} />;
  if (!cart.items.length) return <><Empty icon="🛒" title="Your cart is empty" action={<Link className="sf-btn" href="/products">Shop accessories</Link>}>Looks like you haven&apos;t added anything yet.</Empty>{pick.data?.items.length ? <><SectionTitle title="Popular right now" /><Rail label="Popular">{pick.data.items.map((i) => <ItemCard key={i.id} item={i} />)}</Rail></> : null}</>;
  return (
    <div className="cart-page">
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Cart" }]} />
      <h1 className="cart-title">Shopping cart <span>({cart.itemCount} item{cart.itemCount === 1 ? "" : "s"})</span></h1>
      <div className="sf-cart">
        <div className="cart-main">
          {quote && quote.freeShippingThreshold != null && <div className="sf-fs" style={{ background: "#fff", border: "1px solid var(--ln)" }}>{quote.freeShippingRemaining <= 0 ? <b>🎉 You&apos;ve unlocked FREE shipping!</b> : <>Add <b>{inr(quote.freeShippingRemaining)}</b> more to get <b>FREE shipping</b></>}<div className="tr"><i style={{ width: `${Math.min(100, ((quote.freeShippingThreshold - quote.freeShippingRemaining) / quote.freeShippingThreshold) * 100)}%` }} /></div></div>}
          <div className="sf-box cart-lines">
            {cart.items.map((l) => (
              <div key={l.key} className="sf-ci" style={{ opacity: l.available ? 1 : 0.65 }}>
                <Link href={`/products/${l.slug}`} className="im"><Img src={l.image} alt={l.name} w={240} /></Link>
                <div className="cart-info"><Link href={`/products/${l.slug}`} className="cart-name">{l.name}</Link>
                  <div className="muted small" style={{ color: "var(--mu)", margin: "2px 0 8px" }}>{inr(l.unitPrice)} each{l.listPrice > l.unitPrice && <> · <s>{inr(l.listPrice)}</s></>}</div>
                  {l.issue && <div className="cart-issue">⚠ {l.issue}</div>}
                  <div className="cart-tools">
                    <Qty value={l.quantity} max={Math.max(1, l.maxQuantity)} disabled={busy} onChange={(q) => change(() => api(`/api/me/cart/items/${l.id}`, { method: "PATCH", body: { quantity: q } }))} />
                    <button className="sf-btn text" onClick={() => { if (!isWished(l.id)) toggleWish({ kind: "products", id: l.id, slug: l.slug ?? "" }, { silent: true }); change(() => api(`/api/me/cart/items/${l.id}`, { method: "DELETE" })); }}><FiHeart size={14} /> Save for later</button>
                    <button className="sf-btn text" style={{ color: "var(--deal)" }} onClick={() => change(() => api(`/api/me/cart/items/${l.id}`, { method: "DELETE" }))}><FiTrash2 size={14} /> Remove</button></div></div>
                <div className="cart-total">{inr(l.lineTotal)}</div>
              </div>))}
          </div>
        </div>
        <aside className="sf-sum">
          <div className="sf-box"><h3><FiTag style={{ verticalAlign: "-2px" }} /> Have a coupon?</h3>
            {quote?.couponCode ? <div className="sf-fs" style={{ margin: 0 }}><b>{quote.couponCode}</b> applied — you save {inr(quote.couponDiscount)} <button className="sf-btn text" onClick={() => { setApplied(undefined); setCode(""); void load(undefined); }}>Remove</button></div>
              : <form className="cart-coupon" onSubmit={async (e) => { e.preventDefault(); if (code.length < 3) return; setBusy(true); setApplied(code); await load(code); setBusy(false); }}><input className="sf-in" placeholder="Enter code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Coupon code" /><button className="sf-btn ghost" disabled={busy || code.length < 3}>Apply</button></form>}</div>
          <div className="sf-box"><h3>Price details</h3>{quote ? <PriceBox q={quote} shippingNote="Calculated at checkout for your address" /> : <Skel h={120} />}
            {cart.hasIssues && <p style={{ color: "var(--deal)", fontSize: ".86rem" }}>Remove or fix the unavailable items to continue.</p>}
            <Link href="/checkout" className="sf-btn lg block" aria-disabled={cart.hasIssues} style={cart.hasIssues ? { pointerEvents: "none", opacity: 0.5 } : undefined}>Proceed to checkout</Link>
            <Link href="/products" className="sf-btn text" style={{ width: "100%", marginTop: 6 }}>Continue shopping</Link></div>
        </aside>
      </div>
      {/* phones: the total and checkout stay within reach while the list scrolls */}
      {quote && (
        <div className="cart-bar">
          <div><span>Total</span><b>{inr(quote.grandTotal)}</b></div>
          <Link href="/checkout" className="sf-btn" aria-disabled={cart.hasIssues} style={cart.hasIssues ? { pointerEvents: "none", opacity: 0.5 } : undefined}>Checkout</Link>
        </div>
      )}
      {pick.data?.items.length ? <><SectionTitle title="You may also like" /><Rail label="Suggestions">{pick.data.items.filter((i) => !cart.items.some((l) => l.id === i.id)).map((i) => <ItemCard key={i.id} item={i} />)}</Rail></> : null}
    </div>
  );
}
