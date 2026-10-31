"use client";
import Link from "next/link";
import { FiLock, FiPackage } from "react-icons/fi";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Confirm, ErrorBox, Modal, Select, Spinner, TextArea, TextField } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { Can } from "@/lib/ui/admin";
import { dt, inr, minorToRupees, rupeesToMinor, title } from "@/lib/ui/format";
import { useAction, useApi } from "@/lib/ui/hooks";

interface Item { _id: string; name: string; sku?: string; petCode?: string; quantity: number; unitPrice: number; discountAmount: number; taxAmount: number; lineTotal: number; inventoryState: string }
interface Order { _id: string; orderNumber: string; customerId: string; status: string; paymentStatus: string; items: Item[]; subtotal: number; discountTotal: number; couponCode?: string; shippingTotal: number; taxTotal: number; grandTotal: number; amountPaid: number; amountRefunded: number; customerSnapshot?: { name?: string; email?: string; phone?: string }; shippingAddress: Record<string, string>; shipping?: { partner?: string; trackingNumber?: string; trackingUrl?: string; notes?: string }; customerNote?: string; adminNote?: string; statusHistory: { from?: string; to: string; at: string; actorType: string; actorId?: string; note?: string }[]; createdAt: string }
interface Pay { _id: string; paymentRef: string; provider: string; status: string; amount: number; amountRefunded: number; providerPaymentId?: string; paymentMethodType?: string; refunds: { destination: string; amount: number; status: string; reason?: string }[] }
const NEXT: Record<string, string[]> = { placed: ["accepted"], accepted: ["confirmed"], confirmed: ["processing"], processing: ["shipped"], shipped: ["in_transit", "delivered"], in_transit: ["out_for_delivery", "delivered"], out_for_delivery: ["delivered"], delivered: ["refund_initiated"], cancelled: ["refund_initiated"], refund_initiated: ["refunded"] };

export default function AdminOrder() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useApi<{ order: Order; payments: Pay[] }>(`/api/admin/orders/${id}`);
  const { busy, run } = useAction();
  const [dlg, setDlg] = useState<"" | "cancel" | "refund" | "ship" | "note" | "status">(""), [next, setNext] = useState("");
  const [f, setF] = useState({ note: "", reason: "", amount: "", dest: "wallet", partner: "", tracking: "", url: "", adminNote: "" });
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error ?? "Not found"} retry={reload} />;
  const { order: o, payments } = data;
  const act = async (fn: () => Promise<unknown>, msg: string) => { if (await run(fn, msg) !== undefined) { setDlg(""); reload(); } };
  const canCancel = ["placed", "accepted", "confirmed", "processing"].includes(o.status);
  const refundable = o.amountPaid - o.amountRefunded;
  return (
    <div className="set sd">
      <div className="top"><div><Link href="/admin/orders">← Orders</Link><h1>{o.orderNumber}</h1><span className="muted small">{dt(o.createdAt)}</span></div><div className="row"><Badge status={o.status} /><Badge status={o.paymentStatus} label={`Payment: ${title(o.paymentStatus)}`} /></div></div>
      <Can perm="orders.write"><div className="card row"><strong>Actions:</strong>
        {(NEXT[o.status] ?? []).map((s) => <Button key={s} onClick={() => { setNext(s); setDlg("status"); }}>Mark {title(s)}</Button>)}
        <Button className="ghost" onClick={() => { setF({ ...f, partner: o.shipping?.partner ?? "", tracking: o.shipping?.trackingNumber ?? "", url: o.shipping?.trackingUrl ?? "" }); setDlg("ship"); }}>Shipping details</Button>
        <Button className="ghost" onClick={() => { setF({ ...f, adminNote: o.adminNote ?? "" }); setDlg("note"); }}>Private note</Button>
        {["shipped", "in_transit", "out_for_delivery", "delivered"].includes(o.status) && <Button className="ghost" busy={busy} onClick={() => act(() => api(`/api/admin/orders/${o._id}/invoice`, { method: "POST" }), "Invoice issued")}>Issue / re-issue invoice</Button>}
        {canCancel && <Button className="danger" onClick={() => { setF({ ...f, reason: "" }); setDlg("cancel"); }}>Cancel order</Button>}
        <Can perm="finance.write">{refundable > 0 && <Button className="ghost" onClick={() => { setF({ ...f, amount: "", reason: "", dest: "wallet" }); setDlg("refund"); }}>Refund…</Button>}</Can>
      </div></Can>
      {o.paymentStatus === "pending" && o.status === "placed" && <Alert kind="warn">Awaiting payment — released automatically by the maintenance job after the reservation window.</Alert>}
      <div className="grid g2">
        <div className="card"><h3>Customer</h3><p>{o.customerSnapshot?.name}<br />{o.customerSnapshot?.email}<br />{o.customerSnapshot?.phone}<br /><Link href={`/admin/customers/${o.customerId}`}>Open customer →</Link></p>{o.customerNote && <Alert kind="info">Customer note: {o.customerNote}</Alert>}</div>
        <div className="card"><h3>Ship to</h3><p>{o.shippingAddress.recipientName} · {o.shippingAddress.phone}<br />{o.shippingAddress.line1}{o.shippingAddress.line2 ? `, ${o.shippingAddress.line2}` : ""}<br />{o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.postalCode}</p>{o.shipping?.trackingNumber && <p className="small"><FiPackage /> {o.shipping.partner} · {o.shipping.trackingNumber}</p>}</div>
      </div>
      {o.adminNote && <Alert kind="warn"><FiLock /> Private note: {o.adminNote}</Alert>}
      <div className="card flush tw"><table className="t"><thead><tr><th>Item</th><th className="right">Qty</th><th className="right">Unit</th><th className="right">Discount</th><th className="right">GST</th><th className="right">Total</th><th>Stock</th></tr></thead><tbody>
        {o.items.map((i) => <tr key={i._id}><td><strong>{i.name}</strong><div className="small muted">{i.sku ?? i.petCode}</div></td><td className="right">{i.quantity}</td><td className="right">{inr(i.unitPrice)}</td><td className="right">{inr(i.discountAmount)}</td><td className="right">{inr(i.taxAmount)}</td><td className="right">{inr(i.lineTotal)}</td><td><Badge status={i.inventoryState === "committed" ? "ok" : i.inventoryState === "released" ? "bad" : "pending"} label={i.inventoryState} /></td></tr>)}
        <tr><td colSpan={5} className="right">Shipping</td><td className="right">{inr(o.shippingTotal)}</td><td /></tr><tr><td colSpan={5} className="right"><strong>Grand total</strong>{o.couponCode && <span className="muted small"> (coupon {o.couponCode})</span>}</td><td className="right"><strong>{inr(o.grandTotal)}</strong></td><td /></tr>
      </tbody></table></div>
      <div className="card"><h3>Payments</h3>{!payments.length ? <p className="muted">No payment attempts yet.</p> : <div className="tw"><table className="t"><thead><tr><th>Ref</th><th>Provider</th><th>Status</th><th className="right">Amount</th><th className="right">Refunded</th><th>Refunds</th></tr></thead><tbody>{payments.map((p) => <tr key={p._id}><td className="mono">{p.paymentRef}<div className="small muted">{p.providerPaymentId}</div></td><td>{p.provider} {p.paymentMethodType && `· ${p.paymentMethodType}`}</td><td><Badge status={p.status} /></td><td className="right">{inr(p.amount)}</td><td className="right">{inr(p.amountRefunded)}</td><td className="small">{p.refunds.map((r, i) => <div key={i}>{inr(r.amount)} → {r.destination} <Badge status={r.status} /></div>)}</td></tr>)}</tbody></table></div>}</div>
      <div className="card"><h3>History</h3>{o.statusHistory.map((h, i) => <div key={i} className="small">{dt(h.at)} · <strong>{title(h.to)}</strong> · {h.actorType}{h.note ? ` · ${h.note}` : ""}</div>)}</div>

      <Modal open={dlg === "status"} onClose={() => setDlg("")} title={`Mark as ${title(next)}`}><div className="col"><TextField label="Note (optional)" value={f.note} onChange={(v) => setF({ ...f, note: v })} /><Button busy={busy} onClick={() => act(() => api(`/api/admin/orders/${o._id}/status`, { method: "POST", body: { status: next, note: f.note || undefined } }), `Marked ${next}`)}>Confirm</Button></div></Modal>
      <Modal open={dlg === "ship"} onClose={() => setDlg("")} title="Shipping details"><div className="col"><TextField label="Courier / partner" value={f.partner} onChange={(v) => setF({ ...f, partner: v })} /><TextField label="Tracking number" value={f.tracking} onChange={(v) => setF({ ...f, tracking: v })} /><TextField label="Tracking URL" value={f.url} onChange={(v) => setF({ ...f, url: v })} placeholder="https://" /><Button busy={busy} onClick={() => act(() => api(`/api/admin/orders/${o._id}/shipping`, { method: "PATCH", body: { partner: f.partner || undefined, trackingNumber: f.tracking || undefined, trackingUrl: f.url || undefined } }), "Shipping saved")}>Save</Button></div></Modal>
      <Modal open={dlg === "note"} onClose={() => setDlg("")} title="Private note"><div className="col"><TextArea label="Visible to staff only" value={f.adminNote} onChange={(v) => setF({ ...f, adminNote: v })} maxLength={2000} /><Button busy={busy} onClick={() => act(() => api(`/api/admin/orders/${o._id}/note`, { method: "PATCH", body: { adminNote: f.adminNote } }), "Note saved")}>Save</Button></div></Modal>
      <Confirm open={dlg === "cancel"} onClose={() => setDlg("")} danger busy={busy} title="Cancel this order?" confirmLabel="Cancel order" onConfirm={() => act(() => api(`/api/admin/orders/${o._id}/cancel`, { method: "POST", body: { reason: f.reason || undefined } }), "Order cancelled")}>
        <p>Stock and pet reservations are released.{o.amountPaid > 0 ? ` ${inr(o.amountPaid - o.amountRefunded)} is refunded to the customer's wallet.` : ""}</p><TextField label="Reason" value={f.reason} onChange={(v) => setF({ ...f, reason: v })} /></Confirm>
      <Modal open={dlg === "refund"} onClose={() => setDlg("")} title="Refund"><div className="col"><Alert kind="info">Refundable now: {inr(refundable)}</Alert>
        <TextField label="Amount ₹ (blank = full remaining)" type="number" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} min={0} step="0.01" placeholder={minorToRupees(refundable)} />
        <Select label="Refund to" value={f.dest} onChange={(v) => setF({ ...f, dest: v })} options={[{ value: "wallet", label: "Customer wallet (instant)" }, { value: "original", label: "Original payment method (Razorpay, 5–7 days)" }]} />
        <TextField label="Reason" value={f.reason} onChange={(v) => setF({ ...f, reason: v })} />
        <Button busy={busy} onClick={() => act(() => api(`/api/admin/orders/${o._id}/refund`, { method: "POST", body: { amount: f.amount ? rupeesToMinor(f.amount) : undefined, reason: f.reason || undefined, destination: f.dest } }), "Refund processed")}>Refund</Button></div></Modal>
    </div>
  );
}
