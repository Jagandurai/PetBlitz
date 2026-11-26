"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FiPackage } from "react-icons/fi";
import { Empty, Skel } from "./ui";
import { api, errText } from "@/lib/ui/api";
import { dt, inr } from "@/lib/ui/format";
import { useAuth } from "@/lib/ui/hooks";

interface O { _id: string; orderNumber: string; status: string; paymentStatus: string; grandTotal: number; createdAt: string; items: { _id: string; name: string; quantity: number; lineTotal: number }[]; shippingAddress: Record<string, string> }

export default function Confirmed({ id }: { id: string }) {
  const { refresh } = useAuth();
  const [o, setO] = useState<O | null>(null), [err, setErr] = useState<string | null>(null), [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    api<O>(`/api/me/orders/${id}`).then((x) => { if (!live) return; setO(x); if (x.paymentStatus === "pending" && tries < 6) setTimeout(() => live && setTries((t) => t + 1), 2500); else void refresh(); }).catch((e) => live && setErr(errText(e)));
    return () => { live = false; };
  }, [id, tries]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <Empty icon="⚠️" title="We couldn't load this order" action={<Link className="sf-btn" href="/account/orders">My orders</Link>}>{err}</Empty>;
  if (!o) return <Skel h={300} />;
  const paid = o.paymentStatus === "paid" || o.paymentStatus === "partially_refunded";
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="sf-box sf-ok">
        <div className="sf-tick" aria-hidden="true">{paid ? "✓" : "⏳"}</div>
        <h1 style={{ margin: "14px 0 6px" }}>{paid ? "Thank you! Your order is confirmed" : "Order placed — confirming your payment"}</h1>
        <p style={{ color: "var(--mu)", margin: 0 }}>{paid ? "We've emailed your confirmation and will keep you updated at every step." : "This can take a few seconds. If you've already paid, this page updates automatically."}</p>
        <p style={{ fontSize: "1.1rem" }}>Order <b>{o.orderNumber}</b> · {dt(o.createdAt)}</p>
      </div>
      <div className="sf-box"><h3>What happens next</h3>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}><li>{paid ? "✅ Payment received" : "Payment verification in progress"}</li><li>We confirm and pack your order</li><li>You get tracking details by e-mail once it ships</li><li>Your GST invoice appears in your account when it ships</li></ol></div>
      <div className="sf-box"><h3>Order summary</h3>{o.items.map((i) => <div key={i._id} className="sf-sr"><span>{i.name} × {i.quantity}</span><span>{inr(i.lineTotal)}</span></div>)}<div className="sf-sr t"><span>Total {paid ? "paid" : "payable"}</span><span>{inr(o.grandTotal)}</span></div>
        <p style={{ margin: "12px 0 0", color: "var(--mu)", fontSize: ".9rem" }}><FiPackage style={{ verticalAlign: "-2px" }} /> Delivering to {o.shippingAddress.recipientName}, {o.shippingAddress.line1}, {o.shippingAddress.city} – {o.shippingAddress.postalCode}</p></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 16 }}>
        {!paid && o.status === "placed" && <Link className="sf-btn amber lg" href={`/account/orders/${o._id}?pay=1`}>Complete payment</Link>}
        <Link className="sf-btn lg" href={`/account/orders/${o._id}`}>View order</Link><Link className="sf-btn ghost lg" href="/products">Continue shopping</Link></div>
    </div>
  );
}
