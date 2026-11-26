"use client";
import { CSSProperties, useState } from "react";
import { FiCheck, FiExternalLink, FiInfo, FiLock, FiSave, FiTruck, FiX } from "react-icons/fi";
import { Alert, Badge, Button, Confirm, Field, TextField } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { useAdmin } from "@/lib/ui/admin";
import { ORDER_STAGES, ReturnInfo, StageKey, buildTimeline, isHttpUrl, nextStage, normalizeStatus, orderStatusLabel, stageIndex } from "@/lib/order-status";
import { dt } from "@/lib/ui/format";
import { useAction } from "@/lib/ui/hooks";
import "./order-status.css";

export interface StatusOrder {
  _id: string; status: string; paymentStatus: string; createdAt: string;
  shipping?: { partner?: string; trackingNumber?: string; trackingUrl?: string; estimatedDelivery?: string; customerRemarks?: string };
  statusHistory: { from?: string; to: string; at: string }[];
  returnInfo?: ReturnInfo;
}

const formOf = (o: StatusOrder) => ({
  partner: o.shipping?.partner ?? "", trackingNumber: o.shipping?.trackingNumber ?? "", trackingUrl: o.shipping?.trackingUrl ?? "",
  estimatedDelivery: o.shipping?.estimatedDelivery?.slice(0, 10) ?? "", customerRemarks: o.shipping?.customerRemarks ?? "",
});

/** Order Status Management. Moves are made by hand, one stage at a time; the server re-checks every rule. */
export function StatusPanel({ order: o, onSaved }: { order: StatusOrder; onSaved: () => void }) {
  const writable = useAdmin().can("orders.write");
  const saved = formOf(o);
  const { steps } = buildTimeline(o.status, o.statusHistory, o.createdAt, o.returnInfo);
  const [f, setF] = useState(saved), [target, setTarget] = useState(""), [confirm, setConfirm] = useState(false);
  const { busy, run } = useAction();
  const idx = stageIndex(o.status), next = nextStage(o.status);
  const delivered = normalizeStatus(o.status) === "delivered";
  const needsPayment = (next === "accepted" || next === "packed") && !["paid", "partially_refunded"].includes(o.paymentStatus);
  const badUrl = !!f.trackingUrl.trim() && !isHttpUrl(f.trackingUrl.trim());
  const dirty = (Object.keys(saved) as (keyof typeof saved)[]).some((k) => f[k].trim() !== saved[k]);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const courier = () => ({ ...f, estimatedDelivery: f.estimatedDelivery || null });

  const send = async (path: "status" | "shipping", body: unknown, message: string) => {
    const r = await run(() => api(`/api/admin/orders/${o._id}/${path}`, { method: path === "status" ? "POST" : "PATCH", body }), message);
    setConfirm(false);
    if (r !== undefined) { setTarget(""); onSaved(); }
  };
  const update = () => {
    const remarks = f.customerRemarks.trim();
    // the history keeps a remark only when it was written for this update
    return send("status", { status: target, note: remarks && remarks !== saved.customerRemarks ? remarks : undefined, shipping: courier() }, `Order marked ${orderStatusLabel(target)}`);
  };

  return (
    <section className="card osm" aria-labelledby="osm-title">
      <header className="osm-head">
        <i aria-hidden="true"><FiTruck /></i>
        <div><h2 id="osm-title">Order Status Management</h2><p>Updated by hand. Check the real shipment progress before choosing On the Way or Delivered.</p></div>
      </header>

      <ol className="osm-steps" aria-label="Order progress" style={{ "--n": steps.length } as CSSProperties}>
        {steps.map((s, i) => <li key={s.key} className={`${s.state}${steps[i + 1]?.state === "stop" ? " to-stop" : ""}`} aria-current={s.state === "cur" || s.state === "stop" ? "step" : undefined}><i aria-hidden="true">{s.state === "done" ? <FiCheck /> : s.state === "stop" ? <FiX /> : i + 1}</i><b>{s.label}</b>{s.at && <small>{dt(s.at)}</small>}</li>)}
      </ol>

      <div className="osm-grid">
        <div className="osm-field">
          <span>Current Order Status</span>
          <output className="osm-current"><Badge status={normalizeStatus(o.status)} label={orderStatusLabel(o.status)} /><FiLock aria-label="Read only" /></output>
        </div>
        <Field label="Update Order Status">
          <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={!writable || !next || busy}>
            <option value="">{next ? "Choose the next status…" : "No further status changes"}</option>
            {ORDER_STAGES.map((s) => <option key={s.key} value={s.key} disabled={s.key !== next}>{s.label}{s.key === "placed" ? " (set by the system)" : s.key === next ? " (next step)" : ""}</option>)}
          </select>
        </Field>
        <TextField label="Courier Partner" value={f.partner} onChange={set("partner")} maxLength={80} placeholder="Courier name" disabled={!writable} />
        <TextField label="Tracking Number / AWB Number" value={f.trackingNumber} onChange={set("trackingNumber")} maxLength={80} placeholder="AWB number" disabled={!writable} />
        <TextField label="Courier Tracking URL (optional)" type="url" value={f.trackingUrl} onChange={set("trackingUrl")} maxLength={2048} placeholder="https://" disabled={!writable} />
        <TextField label="Estimated Delivery Date (optional)" type="date" value={f.estimatedDelivery} onChange={set("estimatedDelivery")} disabled={!writable} />
        <label className="f osm-wide">Customer-visible Remarks (optional)
          <span className="hint">The customer sees this on their order page.</span>
          <textarea value={f.customerRemarks} maxLength={500} rows={3} disabled={!writable} onChange={(e) => set("customerRemarks")(e.target.value)} />
          <span className="osm-count">{f.customerRemarks.length}/500</span>
        </label>
      </div>

      {badUrl && <Alert kind="err">Enter the full tracking link, starting with http:// or https://.</Alert>}
      {!badUrl && f.trackingUrl.trim() && <a className="osm-test" href={f.trackingUrl.trim()} target="_blank" rel="noopener noreferrer">Check this link <FiExternalLink aria-hidden="true" /></a>}
      {delivered && <p className="osm-info ok"><FiCheck aria-hidden="true" /> This order is delivered. Its status can no longer be changed here; courier details can still be corrected.</p>}
      {idx < 0 && <p className="osm-info"><FiInfo aria-hidden="true" /> This order is {orderStatusLabel(o.status).toLowerCase()}. Use the cancellation and refund actions above.</p>}
      {needsPayment && <p className="osm-info warn"><FiInfo aria-hidden="true" /> Payment is still pending. The order can be marked {orderStatusLabel(next!)} once it is paid.</p>}

      {writable && (
        <footer className="osm-actions">
          {/* says why a greyed-out button cannot be used yet */}
          <span role="status">{dirty ? "You have unsaved courier changes." : "No unsaved courier changes. Edit a courier field to enable saving."} Status updates never change the payment status.</span>
          <Button type="button" className="ghost" disabled={busy || !dirty || badUrl} onClick={() => send("shipping", courier(), "Courier details saved")}><FiSave aria-hidden="true" /> Save courier details only</Button>
          <Button type="button" busy={busy} disabled={!target || badUrl || needsPayment} onClick={() => ((target as StageKey) === "delivered" ? setConfirm(true) : update())}><FiCheck aria-hidden="true" /> Update Order Status</Button>
        </footer>
      )}

      <Confirm open={confirm} onClose={() => !busy && setConfirm(false)} busy={busy} title="Mark this order as Delivered?" confirmLabel="Yes, mark as Delivered" onConfirm={update}>
        <p>Only continue after confirming that the parcel has reached the customer. The status cannot be changed back afterwards.</p>
      </Confirm>
    </section>
  );
}
