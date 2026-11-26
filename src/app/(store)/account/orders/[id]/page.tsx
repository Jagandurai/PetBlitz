"use client";
import Link from "next/link";
import { FiArrowLeft, FiCheck, FiCreditCard, FiFileText, FiMapPin, FiPackage } from "react-icons/fi";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Alert, Badge, Button, Confirm, ErrorBox, Img, Modal, Select, Spinner, TextArea } from "@/components/ui";
import { api, errText } from "@/lib/ui/api";
import { payOrderWithRazorpay } from "@/lib/ui/razorpay";
import { dt, inr, title } from "@/lib/ui/format";
import { useAction, useApi, useAuth, useToast } from "@/lib/ui/hooks";
import { useSeen } from "@/lib/ui/unread";
import "./order-detail.css";

interface Item { _id: string; itemType: string; name: string; imageUrl?: string; quantity: number; unitPrice: number; lineTotal: number; taxAmount: number; slug?: string }
interface Order { _id: string; orderNumber: string; status: string; paymentStatus: string; createdAt: string; items: Item[]; subtotal: number; discountTotal: number; couponCode?: string; couponDiscount?: number; shippingTotal: number; taxTotal: number; grandTotal: number; amountPaid: number; amountRefunded: number; pricesIncludeTax?: boolean; shippingAddress: Record<string, string>; shipping?: { partner?: string; trackingNumber?: string; trackingUrl?: string; estimatedDelivery?: string }; statusHistory: { to: string; at: string }[]; cancellation?: { reason?: string } }
const FLOW = ["placed", "accepted", "confirmed", "processing", "shipped", "in_transit", "out_for_delivery", "delivered"];

function Inner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const { me, refresh } = useAuth();
  const { toast } = useToast();
  const { data: o, loading, error, reload } = useApi<Order>(`/api/me/orders/${id}`);
  const { busy, run } = useAction();
  const [cancel, setCancel] = useState(false), [review, setReview] = useState<Item | null>(null), [ret, setRet] = useState<Item | null>(null), [paying, setPaying] = useState(false);
  // payment may be confirmed by the webhook a moment after Razorpay closes: poll briefly while pending after a pay attempt
  const [poll, setPoll] = useState(0);
  useEffect(() => { if (!poll || o?.paymentStatus !== "pending") return; const t = setTimeout(() => { reload(); setPoll((p) => (p > 6 ? 0 : p + 1)); }, 2500); return () => clearTimeout(t); }, [poll, o?.paymentStatus, reload]);
  // admin status changes show up without a manual reload
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === "visible") reload(); }, 30000); return () => clearInterval(t); }, [reload]);
  useSeen(!!o);
  if (loading && !o) return <Spinner />;
  if (error || !o) return <ErrorBox msg={error ?? "Order not found"} retry={reload} />;
  const payable = o.status === "placed" && o.paymentStatus === "pending";
  const prefill = { name: me?.displayName, email: me?.email, contact: me?.phone };
  const payCard = async () => { setPaying(true); try { const r = await payOrderWithRazorpay(o._id, prefill); toast(r.handled ? "Payment received. Thank you!" : "Payment is being confirmed…", "ok"); setPoll(1); reload(); } catch (e) { toast(errText(e), "err"); } finally { setPaying(false); } };
  const payWallet = async () => { const r = await run(() => api("/api/me/orders/" + o._id + "/pay/wallet", { method: "POST" }), "Paid from wallet"); if (r) { await refresh(); reload(); } };
  const cancellable = ["placed", "accepted", "confirmed"].includes(o.status);
  const idx = FLOW.indexOf(o.status);
  return (
    <div className="odt">
      <header className="odt-head">
        <div>
          <Link href="/account/orders" className="odt-back"><FiArrowLeft aria-hidden="true" /> My orders</Link>
          <h1>Order {o.orderNumber}</h1>
          <p>Placed {dt(o.createdAt)}</p>
        </div>
        <div className="odt-badges"><Badge status={o.status} label={title(o.status)} /><Badge status={o.paymentStatus} label={`Payment: ${o.paymentStatus.replace("_", " ")}`} /></div>
      </header>
      {sp.get("pay") && payable && <Alert kind="info">Your order is placed. <strong>Complete the payment below</strong> to confirm it — unpaid orders are released after 30 minutes.</Alert>}
      {payable && (
        <section className="odt-pay">
          <div><span>Complete payment</span><b>{inr(o.grandTotal)}</b></div>
          <div className="odt-pay-actions"><Button busy={paying} onClick={payCard}><FiCreditCard aria-hidden="true" /> Pay with UPI / card / netbanking</Button>{me && me.wallet.balance >= o.grandTotal && <Button className="ghost" busy={busy} onClick={payWallet}>Pay {inr(o.grandTotal)} from wallet</Button>}</div>
          {me && me.wallet.balance < o.grandTotal && me.wallet.balance > 0 && <p>Wallet balance {inr(me.wallet.balance)} is lower than the total. <Link href="/account/wallet">Top up</Link></p>}
        </section>
      )}
      {o.status !== "cancelled" && idx >= 0 && (
        <section className="odt-card" aria-labelledby="odt-progress">
          <h2 id="odt-progress">Order progress</h2>
          <ol className="odt-track">{FLOW.map((s, i) => { const at = o.statusHistory.find((h) => h.to === s)?.at; const done = i < idx || o.status === "delivered"; return <li key={s} className={done ? "done" : i === idx ? "cur" : ""} aria-current={i === idx ? "step" : undefined}><i aria-hidden="true">{done ? <FiCheck /> : i + 1}</i><span><b>{title(s)}</b>{at && <small>{dt(at)}</small>}</span></li>; })}</ol>
        </section>
      )}
      {o.status === "cancelled" && <Alert kind="warn">This order was cancelled{o.cancellation?.reason ? `: ${o.cancellation.reason}` : ""}.{o.amountRefunded > 0 && ` ${inr(o.amountRefunded)} was refunded to your wallet.`}</Alert>}
      {o.shipping?.trackingNumber && <p className="odt-ship"><FiPackage aria-hidden="true" /><span>{o.shipping.partner ?? "Courier"} · Tracking <strong>{o.shipping.trackingNumber}</strong> {o.shipping.estimatedDelivery && <>· Est. delivery {dt(o.shipping.estimatedDelivery)} </>}{o.shipping.trackingUrl && <a href={o.shipping.trackingUrl} target="_blank" rel="noopener noreferrer">Track Shipment →</a>}</span></p>}
      {!o.shipping?.trackingNumber && ["placed", "accepted", "confirmed", "processing"].includes(o.status) && <p className="odt-ship quiet"><FiPackage aria-hidden="true" /><span>Shipping details will appear here once your order is shipped.</span></p>}
      <section className="odt-card" aria-labelledby="odt-items">
        <h2 id="odt-items">Items ({o.items.length})</h2>
        <ul className="odt-items">
          {o.items.map((i) => (
            <li key={i._id}>
              <div className="odt-img"><Img src={i.imageUrl} alt={i.name} className="" /></div>
              <div className="odt-name"><strong>{i.name}</strong><span>Quantity: {i.quantity}</span></div>
              <b className="odt-line">{inr(i.lineTotal)}</b>
              {o.status === "delivered" && i.itemType === "product" && <div className="odt-item-actions"><Button className="ghost sm" onClick={() => setReview(i)}>Review</Button><Button className="ghost sm" onClick={() => setRet(i)}>Return</Button></div>}
            </li>
          ))}
        </ul>
      </section>
      <div className="odt-two">
        <section className="odt-card">
          <h2><FiMapPin aria-hidden="true" /> Delivery address</h2>
          <address><b>{o.shippingAddress.recipientName}</b><br />{o.shippingAddress.line1}{o.shippingAddress.line2 ? `, ${o.shippingAddress.line2}` : ""}<br />{o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.postalCode}<br />Mobile: {o.shippingAddress.phone}</address>
        </section>
        <section className="odt-card">
          <h2><FiFileText aria-hidden="true" /> Payment summary</h2>
          <dl className="odt-sum">
            <div><dt>Items</dt><dd>{inr(o.subtotal)}</dd></div>
            {o.discountTotal > 0 && <div className="save"><dt>Discounts{o.couponCode ? ` (${o.couponCode})` : ""}</dt><dd>−{inr(o.discountTotal)}</dd></div>}
            <div><dt>Shipping</dt><dd>{o.shippingTotal ? inr(o.shippingTotal) : "Free"}</dd></div>
            <div className="small"><dt>{o.pricesIncludeTax ? "GST included" : "GST"}</dt><dd>{inr(o.taxTotal)}</dd></div>
            <div className="total"><dt>Total</dt><dd>{inr(o.grandTotal)}</dd></div>
            {o.amountRefunded > 0 && <div><dt>Refunded</dt><dd>{inr(o.amountRefunded)}</dd></div>}
          </dl>
        </section>
      </div>
      <div className="odt-actions noprint">{["shipped", "in_transit", "out_for_delivery", "delivered"].includes(o.status) && <Link className="btn ghost" href={`/account/orders/${o._id}/invoice`}>View GST invoice</Link>}<Link className="btn ghost" href="/account/support">Need help?</Link>{cancellable && <Button className="ghost odt-cancel" onClick={() => setCancel(true)}>Cancel order</Button>}</div>
      <Confirm open={cancel} onClose={() => setCancel(false)} danger busy={busy} title="Cancel this order?" confirmLabel="Yes, cancel" onConfirm={async () => { const r = await run(() => api(`/api/me/orders/${o._id}/cancel`, { method: "POST", body: { reason: "Cancelled by customer" } }), "Order cancelled"); if (r) { setCancel(false); await refresh(); reload(); } }}>
        <p>{o.paymentStatus === "paid" ? `${inr(o.amountPaid)} will be refunded to your PetBlitz wallet immediately.` : "You have not been charged."}</p></Confirm>
      {review && <ReviewModal order={o} item={review} onClose={() => setReview(null)} />}
      {ret && <ReturnModal order={o} item={ret} onClose={() => setRet(null)} />}
    </div>
  );
}

function ReviewModal({ order, item, onClose }: { order: Order; item: Item; onClose: () => void }) {
  const [rating, setRating] = useState("5"), [t, setT] = useState(""), [c, setC] = useState(""), [imgs, setImgs] = useState<{ url: string; storageKey?: string }[]>([]);
  const { busy, run } = useAction(); const { toast } = useToast();
  const upload = async (f: File | undefined) => {
    if (!f) return;
    try {
      const s = await api<{ uploadUrl: string; fields: Record<string, string | number> }>("/api/me/uploads/sign", { method: "POST" });
      const fd = new FormData(); Object.entries(s.fields).forEach(([k, v]) => fd.append(k, String(v))); fd.append("file", f);
      const r = await fetch(s.uploadUrl, { method: "POST", body: fd }); const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message ?? "Upload failed");
      setImgs((x) => [...x, { url: j.secure_url, storageKey: j.public_id }].slice(0, 5));
    } catch (e) { toast(errText(e), "err"); }
  };
  return (
    <Modal open onClose={onClose} title={`Review ${item.name}`}>
      <div className="col">
        <Select label="Rating" value={rating} onChange={setRating} options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${"★".repeat(n)}${"☆".repeat(5 - n)}` }))} />
        <label className="f">Title<input value={t} maxLength={120} onChange={(e) => setT(e.target.value)} /></label>
        <TextArea label="Your review" value={c} onChange={setC} maxLength={2000} />
        <label className="f">Photos (optional, up to 5)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files?.[0])} /></label>
        {imgs.length > 0 && <div className="small muted">{imgs.length} photo(s) attached</div>}
        <Button busy={busy} onClick={async () => { if (await run(() => api("/api/me/reviews", { method: "POST", body: { orderId: order._id, orderItemId: item._id, rating: Number(rating), title: t || undefined, comment: c || undefined, images: imgs.length ? imgs : undefined } }), "Thanks! Your review will appear after moderation.")) onClose(); }}>Submit review</Button>
      </div>
    </Modal>
  );
}

function ReturnModal({ order, item, onClose }: { order: Order; item: Item; onClose: () => void }) {
  const [qty, setQty] = useState("1"), [reason, setReason] = useState("damaged"), [d, setD] = useState("");
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title={`Return ${item.name}`}>
      <div className="col">
        <Select label="Quantity" value={qty} onChange={setQty} options={Array.from({ length: item.quantity }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
        <Select label="Reason" value={reason} onChange={setReason} options={[["damaged", "Arrived damaged"], ["wrong_item", "Wrong item"], ["not_as_described", "Not as described"], ["no_longer_needed", "No longer needed"], ["other", "Other"]].map(([v, l]) => ({ value: v!, label: l! }))} />
        <TextArea label="Details" value={d} onChange={setD} maxLength={1000} />
        <p className="small muted">Returns are accepted within the return window. Approved refunds go to your wallet.</p>
        <Button busy={busy} onClick={async () => { if (await run(() => api("/api/me/returns", { method: "POST", body: { orderId: order._id, orderItemId: item._id, quantity: Number(qty), reason, details: d || undefined } }), "Return requested")) onClose(); }}>Request return</Button>
      </div>
    </Modal>
  );
}

export default function OrderDetail() { return <Suspense fallback={<Spinner />}><Inner /></Suspense>; }
