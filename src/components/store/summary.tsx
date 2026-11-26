"use client";
import { Quote } from "./types";
import { inr } from "@/lib/ui/format";

/** Price breakdown from the server quote: Price − Discount (+ GST when prices are tax-exclusive) + Shipping = Total. */
export function PriceBox({ q, shippingNote }: { q: Quote; shippingNote?: string }) {
  const n = q.lines.reduce((a, l) => a + l.quantity, 0);
  const saved = q.discountTotal;
  return (
    <div>
      <div className="sf-sr"><span>Price ({n} item{n === 1 ? "" : "s"})</span><span>{inr(q.subtotal)}</span></div>
      {q.discountTotal - q.couponDiscount > 0 && <div className="sf-sr"><span>Discount</span><span className="g">−{inr(q.discountTotal - q.couponDiscount)}</span></div>}
      {q.couponDiscount > 0 && <div className="sf-sr"><span>Coupon ({q.couponCode})</span><span className="g">−{inr(q.couponDiscount)}</span></div>}
      {!q.pricesIncludeTax && q.taxTotal > 0 && <div className="sf-sr"><span>GST</span><span>{inr(q.taxTotal)}</span></div>}
      <div className="sf-sr"><span>Shipping</span><span className={q.shippingTotal === 0 ? "g" : ""}>{q.shippingTotal === 0 ? "FREE" : inr(q.shippingTotal)}</span></div>
      {shippingNote && q.shippingTotal > 0 && <div className="muted small" style={{ color: "var(--mu)", textAlign: "right" }}>{shippingNote}</div>}
      <div className="sf-sr t"><span>Total</span><span>{inr(q.grandTotal)}</span></div>
      {q.pricesIncludeTax && q.taxTotal > 0 && <div className="muted small" style={{ color: "var(--mu)", textAlign: "right" }}>Includes GST of {inr(q.taxTotal)}</div>}
      {saved > 0 && <div className="sf-fs" style={{ margin: "12px 0 0" }}>🎉 You&apos;re saving <b>{inr(saved)}</b> on this order</div>}
    </div>
  );
}
