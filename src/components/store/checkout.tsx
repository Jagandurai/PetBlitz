"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiCheck, FiChevronDown, FiCreditCard, FiLock, FiPlus } from "react-icons/fi";
import { AddressFields, AddrDraft, addrBody, addrValid, emptyAddr } from "./form";
import { PriceBox } from "./summary";
import { Quote } from "./types";
import { Crumbs, Empty, Img, Skel } from "./ui";
import { api, errText } from "@/lib/ui/api";
import { inr } from "@/lib/ui/format";
import { useAuth, useToast } from "@/lib/ui/hooks";
import { payOrderWithRazorpay } from "@/lib/ui/razorpay";
import "./checkout.css";

const STEPS = ["Address", "Review", "Payment"];

export default function CheckoutView() {
  const { me, loading, refresh, refreshCart } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [addrId, setAddrId] = useState(""), [adding, setAdding] = useState(false), [draft, setDraft] = useState<AddrDraft>(emptyAddr), [saving, setSaving] = useState(false);
  const [code, setCode] = useState(""), [coupon, setCoupon] = useState<string | undefined>(), [note, setNote] = useState("");
  const [method, setMethod] = useState<"razorpay" | "wallet">("razorpay");
  const [quote, setQuote] = useState<Quote | null>(null), [qErr, setQErr] = useState<string | null>(null), [placing, setPlacing] = useState(false);
  const idem = useMemo(() => `chk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, []); // one key per checkout visit: retries/double-clicks never create two orders
  const selected = addrId || me?.defaultShippingAddressId || me?.addresses[0]?.id || "";

  useEffect(() => {
    if (!me) return;
    let live = true;
    api<Quote>("/api/me/cart/quote", { method: "POST", body: { ...(selected ? { shippingAddressId: selected } : {}), ...(coupon ? { couponCode: coupon } : {}) } })
      .then((q) => { if (!live) return; setQuote(q); setQErr(null); if (coupon && q.couponError) { toast(q.couponError, "err"); setCoupon(undefined); } })
      .catch((e) => live && setQErr(errText(e)));
    return () => { live = false; };
  }, [me, selected, coupon]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showSummary, setShowSummary] = useState(false);
  // after moving between steps, bring the new step into view (not on first load)
  const stepRefs = useRef<(HTMLElement | null)[]>([]), lastStep = useRef(1);
  useEffect(() => {
    if (lastStep.current === step) return;
    lastStep.current = step;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stepRefs.current[step - 1]?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }, [step]);

  if (loading) return <Skel h={320} />;
  if (!me) return <Empty icon="🔐" title="Sign in to check out" action={<Link className="sf-btn" href="/login?next=/checkout">Sign in</Link>}>Your cart and addresses are saved to your account.</Empty>;
  if (qErr) return <Empty icon="⚠️" title="Couldn't prepare your checkout" action={<Link className="sf-btn" href="/cart">Back to cart</Link>}>{qErr}</Empty>;
  if (!quote) return <Skel h={320} />;
  if (!quote.lines.length) return <Empty icon="🛒" title="Your cart is empty" action={<Link className="sf-btn" href="/products">Continue shopping</Link>}>Add something to your cart to check out.</Empty>;
  const wallet = me.wallet.balance, walletOk = wallet >= quote.grandTotal;
  const addr = me.addresses.find((a) => a.id === selected);

  const saveAddress = async () => {
    setSaving(true);
    try { const r = await api<{ addressId: string }>("/api/me/addresses", { method: "POST", body: addrBody(draft) }); await refresh(); setAddrId(r.addressId); setAdding(false); setDraft(emptyAddr); toast("Address saved", "ok"); }
    catch (e) { toast(errText(e), "err"); } finally { setSaving(false); }
  };
  const place = async () => {
    if (quote.hasIssues || !selected) return;
    setPlacing(true);
    let orderId = "";
    try {
      const r = await api<{ order: { _id: string } }>("/api/me/cart/checkout", { method: "POST", body: { shippingAddressId: selected, couponCode: coupon, customerNote: note || undefined, idempotencyKey: idem } });
      orderId = r.order._id; await refreshCart();
    } catch (e) { toast(errText(e), "err"); setPlacing(false); return; }
    try {
      if (method === "wallet" && walletOk) { await api(`/api/me/orders/${orderId}/pay/wallet`, { method: "POST" }); await refresh(); }
      else await payOrderWithRazorpay(orderId, { name: me.displayName, email: me.email, contact: addr?.phone ?? me.phone });
      router.push(`/order-confirmed/${orderId}`);
    } catch (e) {
      // The order exists and is held for you; send them to complete payment instead of losing it.
      toast(`${errText(e)} — your order is saved. Complete payment to confirm it.`, "err");
      router.push(`/account/orders/${orderId}?pay=1`);
    }
  };

  const formOpen = step === 1 && (adding || !me.addresses.length);
  const count = quote.lines.reduce((a, l) => a + l.quantity, 0);
  // the one next action, repeated in the bar at the bottom of phone screens
  const action = formOpen ? { label: saving ? "Saving…" : "Save & deliver here", disabled: !addrValid(draft) || saving, run: saveAddress }
    : step === 1 ? { label: "Deliver here", disabled: !selected, run: () => setStep(2) }
    : step === 2 ? { label: "Continue to payment", disabled: quote.hasIssues, run: () => setStep(3) }
    : { label: placing ? "Placing order…" : "Place order & pay", disabled: placing || quote.hasIssues || !selected, run: place };
  const sectionProps = (n: number) => ({ ref: (el: HTMLElement | null) => { stepRefs.current[n - 1] = el; }, className: `sf-box co-step${step === n ? " is-current" : ""}${step > n ? " is-done" : ""}${step < n ? " is-locked" : ""}` });

  return (
    <div className="co">
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Cart", href: "/cart" }, { label: "Checkout" }]} />
      <ol className="sf-steps" style={{ listStyle: "none", padding: 0 }} aria-label="Checkout progress">{STEPS.map((s, i) => <li key={s} className={`sf-st ${i + 1 < step ? "done" : i + 1 === step ? "cur" : ""}`} aria-current={i + 1 === step ? "step" : undefined}>{s}</li>)}</ol>
      <div className="co-grid">
        <div className="co-main">
          <section {...sectionProps(1)} aria-labelledby="s1"><div className="co-head"><h2 id="s1">1. Delivery address</h2>{step > 1 && addr && <button className="sf-btn text" onClick={() => setStep(1)}>Change</button>}</div>
            {step === 1 ? <>
              {me.addresses.map((a) => <label key={a.id} className={`sf-ad ${selected === a.id ? "on" : ""}`}><input type="radio" name="addr" checked={selected === a.id} onChange={() => setAddrId(a.id)} /><span className="co-ad-text"><b>{a.recipientName}</b> <span className="sf-chip x">{a.label}</span><br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} – {a.postalCode}<br /><span className="muted small" style={{ color: "var(--mu)" }}>Mobile: {a.phone}</span></span></label>)}
              {(adding || !me.addresses.length) ? <div style={{ marginTop: 10 }}><AddressFields v={draft} set={setDraft} />{!addrValid(draft) && <p className="co-hint">Fill in your name, mobile number, address, city and 6-digit PIN code to continue.</p>}<div className="co-buttons"><button className="sf-btn co-primary" disabled={!addrValid(draft) || saving} onClick={saveAddress}>{saving ? "Saving…" : "Save & deliver here"}</button>{me.addresses.length > 0 && <button className="sf-btn ghost" onClick={() => setAdding(false)}>Cancel</button>}</div></div>
                : <button className="sf-btn ghost co-add" onClick={() => setAdding(true)}><FiPlus /> Add a new address</button>}
              {selected && !adding && <div className="co-next co-primary"><button className="sf-btn lg" onClick={() => setStep(2)}>Deliver to this address</button></div>}
            </> : addr && <p className="co-chosen"><b>{addr.recipientName}</b> · {addr.line1}, {addr.city}, {addr.state} – {addr.postalCode}</p>}
          </section>
          <section {...sectionProps(2)} aria-labelledby="s2"><div className="co-head"><h2 id="s2">2. Review items & offers</h2>{step > 2 && <button className="sf-btn text" onClick={() => setStep(2)}>Change</button>}</div>
            {step >= 2 && <>
              {quote.lines.map((l) => <div key={l.key} className="co-line"><span>{l.name} <span className="muted small" style={{ color: "var(--mu)" }}>× {l.quantity}</span></span><b>{inr(l.lineTotal)}</b></div>)}
              {quote.hasIssues && <p style={{ color: "var(--deal)" }}>Some items are no longer available. <Link href="/cart" style={{ textDecoration: "underline" }}>Update your cart</Link>.</p>}
              {step === 2 && <>
                <div style={{ margin: "14px 0 6px", fontWeight: 700 }}>Coupon</div>
                {quote.couponCode ? <div className="sf-fs" style={{ margin: 0 }}><b>{quote.couponCode}</b> applied — saving {inr(quote.couponDiscount)} <button className="sf-btn text" onClick={() => { setCoupon(undefined); setCode(""); }}>Remove</button></div>
                  : <form className="co-coupon" onSubmit={(e) => { e.preventDefault(); if (code.length >= 3) setCoupon(code); }}><input className="sf-in" placeholder="Enter coupon code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Coupon code" /><button className="sf-btn ghost" disabled={code.length < 3}>Apply</button></form>}
                <label className="co-note">Note for us (optional)<textarea className="sf-in" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Delivery instructions, gift message…" /></label>
                <div className="co-next co-primary"><button className="sf-btn lg" disabled={quote.hasIssues} onClick={() => setStep(3)}>Continue to payment</button></div></>}
            </>}
          </section>
          <section {...sectionProps(3)} aria-labelledby="s3"><h2 id="s3">3. Payment</h2>
            {step === 3 && <>
              <label className={`sf-pm ${method === "razorpay" ? "on" : ""}`}><input type="radio" name="pm" checked={method === "razorpay"} onChange={() => setMethod("razorpay")} /><FiCreditCard size={22} /><span><b>UPI, cards, netbanking</b><br /><span className="muted small" style={{ color: "var(--mu)" }}>Pay securely with Razorpay</span></span></label>
              <label className={`sf-pm ${method === "wallet" ? "on" : ""} ${walletOk ? "" : "dis"}`}><input type="radio" name="pm" disabled={!walletOk} checked={method === "wallet" && walletOk} onChange={() => setMethod("wallet")} /><span style={{ fontSize: "1.3rem" }}>👛</span><span><b>PetBlitz wallet</b> <span className="sf-chip">{inr(wallet)}</span><br /><span className="muted small" style={{ color: "var(--mu)" }}>{walletOk ? "Pay instantly from your balance" : wallet > 0 ? `Balance is lower than ${inr(quote.grandTotal)}` : "No balance yet — refunds are credited here"}</span></span></label>
              <button className="sf-btn lg amber block co-primary co-pay" disabled={placing || quote.hasIssues || !selected} onClick={place}><FiLock /> {placing ? "Placing your order…" : `Place order & pay ${inr(quote.grandTotal)}`}</button>
              <p className="muted small" style={{ color: "var(--mu)", textAlign: "center", marginTop: 10 }}>By placing your order you agree to our <Link href="/terms" style={{ textDecoration: "underline" }}>Terms</Link>, <Link href="/return-policy" style={{ textDecoration: "underline" }}>Return policy</Link> and <Link href="/privacy-policy" style={{ textDecoration: "underline" }}>Privacy policy</Link>. Unpaid orders are released after a short time.</p></>}
          </section>
        </div>
        <aside className={`co-sum${showSummary ? " open" : ""}`}>
          <button type="button" className="co-sum-toggle" aria-expanded={showSummary} aria-controls="co-sum-body" onClick={() => setShowSummary((v) => !v)}>
            <span><b>{showSummary ? "Hide" : "Show"} order summary</b><small>{count} item{count === 1 ? "" : "s"}</small></span>
            <strong>{inr(quote.grandTotal)}</strong><FiChevronDown aria-hidden="true" />
          </button>
          <div id="co-sum-body" className="co-sum-body"><div className="sf-box"><h3>Order summary</h3>
          {quote.lines.slice(0, 4).map((l) => <div key={l.key} className="co-item"><div style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", background: "#f1ece1", flex: "none" }}><Img src={l.image} alt="" w={120} /></div><span>{l.name} × {l.quantity}</span><b>{inr(l.lineTotal)}</b></div>)}
          {quote.lines.length > 4 && <div className="muted small" style={{ color: "var(--mu)" }}>+ {quote.lines.length - 4} more</div>}
          <hr style={{ border: 0, borderTop: "1px solid var(--ln)", margin: "12px 0" }} /><PriceBox q={quote} /></div>
          <p className="co-assure"><FiCheck aria-hidden="true" /> Totals are calculated by our server for your address.</p></div></aside>
      </div>
      <div className="co-bar">
        <div><span>Total</span><b>{inr(quote.grandTotal)}</b></div>
        <button type="button" className={`sf-btn${step === 3 && !formOpen ? " amber" : ""}`} disabled={action.disabled} onClick={() => void action.run()}>{step === 3 && !formOpen && <FiLock aria-hidden="true" />}{action.label}</button>
      </div>
    </div>
  );
}
