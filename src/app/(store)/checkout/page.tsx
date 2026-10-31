"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert, Button, Empty, ErrorBox, Field, Spinner, TextField } from "@/components/ui";
import { AddressForm, emptyAddress } from "@/components/address";
import { api } from "@/lib/ui/api";
import { inr } from "@/lib/ui/format";
import { Address, useAction, useApi, useAuth } from "@/lib/ui/hooks";
import type { CartData } from "../cart/page";

export default function Checkout() {
  const { me, loading: al, refresh, refreshCart } = useAuth();
  const router = useRouter();
  const cart = useApi<CartData>(me ? "/api/me/cart" : null);
  const settings = useApi<{ pricesIncludeTax: boolean; shipping: { baseFeeMinor: number; freeAboveMinor: number | null } }>("/api/settings/public");
  const { busy, run } = useAction();
  const [addrId, setAddrId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyAddress);
  const [code, setCode] = useState(""), [applied, setApplied] = useState<{ code: string; discount: number } | null>(null), [couponErr, setCouponErr] = useState("");
  const [note, setNote] = useState("");
  const key = useMemo(() => `chk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, []); // one key per page visit => double-clicks / retries are idempotent
  if (al || cart.loading) return <Spinner />;
  if (!me) return <Empty>Please <Link href="/login?next=/checkout">sign in</Link> to check out.</Empty>;
  if (cart.error) return <ErrorBox msg={cart.error} retry={cart.reload} />;
  if (!cart.data?.items.length) return <Empty>Your cart is empty.</Empty>;
  const addresses: Address[] = me.addresses;
  const selected = addrId || me.defaultShippingAddressId || addresses[0]?.id || "";
  const sub = cart.data.subtotal - (applied?.discount ?? 0);
  const ship = settings.data ? (settings.data.shipping.freeAboveMinor != null && sub >= settings.data.shipping.freeAboveMinor ? 0 : settings.data.shipping.baseFeeMinor) : 0;
  const applyCoupon = async () => { setCouponErr(""); const r = await run(() => api<{ code: string; discount: number }>("/api/me/cart/coupon-preview", { method: "POST", body: { code } }).catch((e) => { setCouponErr(e.message); return undefined; })); if (r) setApplied(r); };
  const saveAddress = async () => { const r = await run(() => api<{ addressId: string }>("/api/me/addresses", { method: "POST", body: form }), "Address saved"); if (r) { await refresh(); setAddrId(r.addressId); setAdding(false); setForm(emptyAddress); } };
  const place = async () => {
    const r = await run(() => api<{ order: { _id: string } }>("/api/me/cart/checkout", { method: "POST", body: { shippingAddressId: selected, couponCode: applied?.code, customerNote: note || undefined, idempotencyKey: key } }));
    if (r) { await refreshCart(); router.push(`/account/orders/${r.order._id}?pay=1`); }
  };
  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 340px", alignItems: "start" }}>
      <div className="col">
        <h1>Checkout</h1>
        <div className="card col"><h2>1. Delivery address</h2>
          {addresses.map((a) => <label key={a.id} className="chk card" style={{ alignItems: "flex-start" }}><input type="radio" name="addr" checked={selected === a.id} onChange={() => setAddrId(a.id)} /><span><strong>{a.recipientName}</strong> · {a.phone}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.postalCode}</span></label>)}
          {adding || !addresses.length ? <><AddressForm value={form} onChange={setForm} /><div className="row"><Button busy={busy} onClick={saveAddress}>Save address</Button>{addresses.length > 0 && <Button className="ghost" onClick={() => setAdding(false)}>Cancel</Button>}</div></> : <Button className="ghost sm" onClick={() => setAdding(true)}>+ Add a new address</Button>}
        </div>
        <div className="card col"><h2>2. Coupon & notes</h2>
          <div className="row" style={{ alignItems: "flex-end" }}><div className="grow"><TextField label="Coupon code" value={code} onChange={(v) => setCode(v.toUpperCase())} /></div><Button className="ghost" busy={busy} disabled={code.length < 3} onClick={applyCoupon}>Apply</Button></div>
          {applied && <Alert kind="ok">{applied.code} applied: −{inr(applied.discount)} <button className="btn sm ghost" onClick={() => { setApplied(null); setCode(""); }}>Remove</button></Alert>}
          {couponErr && <Alert kind="err">{couponErr}</Alert>}
          <Field label="Note for the seller (optional)"><textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </div>
      <aside className="card col"><h2>Order summary</h2>
        {cart.data.items.map((l) => <div key={l.key} className="row between small"><span>{l.name} × {l.quantity}</span><span>{inr(l.lineTotal)}</span></div>)}
        <hr />
        <div className="row between"><span>Items</span><span>{inr(cart.data.subtotal)}</span></div>
        {applied && <div className="row between"><span>Coupon</span><span>−{inr(applied.discount)}</span></div>}
        <div className="row between"><span>Shipping (est.)</span><span>{ship === 0 ? "Free" : inr(ship)}</span></div>
        <p className="small muted">{settings.data?.pricesIncludeTax ? "Prices include GST." : "GST is added to the final total."} The exact payable amount is confirmed when you place the order; you pay on the next step.</p>
        <Button busy={busy} disabled={!selected || cart.data.hasIssues} onClick={place}>Place order</Button>
        {cart.data.hasIssues && <Alert kind="warn">Fix the unavailable items in your <Link href="/cart">cart</Link> first.</Alert>}
      </aside>
    </div>
  );
}
