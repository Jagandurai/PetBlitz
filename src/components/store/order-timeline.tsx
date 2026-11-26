"use client";
/* The order progress timeline, shared by the order page, My orders and Track order. It only draws what the database says. */
import { CSSProperties } from "react";
import { FiCalendar, FiCheck, FiExternalLink, FiHome, FiInfo, FiMessageSquare, FiRotateCcw, FiTruck, FiX } from "react-icons/fi";
import { LuClipboardCheck, LuMapPin, LuPackage, LuShoppingBag, LuTruck } from "react-icons/lu";
import { ORDER_STAGES, ReturnInfo, StageKey, TRACKING_NOTE, buildTimeline, isHttpUrl } from "@/lib/order-status";
import { day, dt } from "@/lib/ui/format";
import "./order-timeline.css";

const ICONS: Record<StageKey, typeof LuPackage> = { placed: LuShoppingBag, accepted: LuClipboardCheck, packed: LuPackage, dispatched: LuTruck, in_transit: LuMapPin, delivered: FiHome };

export function OrderTimeline({ status, history, createdAt, returnInfo, compact }: { status: string; history: { from?: string; to: string; at: string }[]; createdAt: string; returnInfo?: ReturnInfo; compact?: boolean }) {
  const { steps, stop } = buildTimeline(status, history, createdAt, returnInfo);
  const reached = steps.reduce((n, s, i) => (s.state === "next" ? n : i), 0);
  const stage = ORDER_STAGES.find((s) => s.key === steps[reached]!.key);
  const finished = !stop && stage?.key === "delivered";
  const label = stop?.label ?? stage!.label;
  const StopIcon = stop?.key === "cancelled" ? FiX : FiRotateCcw;
  const Now = stop ? StopIcon : ICONS[stage!.key];
  return (
    <div className={`otl${compact ? " compact" : ""}`}>
      <div className="otl-in">
        <div className={`otl-now${stop ? " stopped" : finished ? " finished" : ""}`}>
          <i aria-hidden="true">{finished ? <FiCheck /> : <Now />}</i>
          <div><b>{label}</b><p>{stop?.description ?? stage!.description}</p></div>
          {!stop && <span className="otl-step">Step {reached + 1} of {ORDER_STAGES.length}</span>}
        </div>
        <ol className="otl-track" aria-label={`Order progress: ${label}`} style={{ "--n": steps.length } as CSSProperties}>
          {steps.map((s, i) => {
            const Icon = s.state === "stop" ? StopIcon : ICONS[s.key as StageKey];
            return (
              <li key={s.key} className={`${s.state}${steps[i + 1]?.state === "stop" ? " to-stop" : ""}`} aria-current={s.state === "cur" || s.state === "stop" ? "step" : undefined} style={{ "--i": i } as CSSProperties}>
                <i aria-hidden="true">{s.state === "done" ? <FiCheck /> : <Icon />}</i>
                <span><b>{s.label}</b>{s.at && <small><time dateTime={s.at}>{dt(s.at)}</time></small>}<em className="otl-sr">{s.state === "done" ? "completed" : s.state === "cur" ? "current stage" : s.state === "stop" ? "the order ended here" : "upcoming"}</em></span>
              </li>
            );
          })}
        </ol>
        {!compact && !stop && <p className="otl-note"><FiInfo aria-hidden="true" /><span>{TRACKING_NOTE}</span></p>}
      </div>
    </div>
  );
}

export interface Shipment { partner?: string; trackingNumber?: string; trackingUrl?: string; estimatedDelivery?: string; customerRemarks?: string }

/** Courier details the admin typed in. The Track Shipment button appears only for a real http(s) link. */
export function ShipmentCard({ shipping: s }: { shipping?: Shipment }) {
  if (!s || !(s.partner || s.trackingNumber || s.trackingUrl || s.estimatedDelivery || s.customerRemarks)) return null;
  const url = s.trackingUrl && isHttpUrl(s.trackingUrl) ? s.trackingUrl : null;
  return (
    <section className="odt-card otl-ship" aria-labelledby="otl-ship-title">
      <h2 id="otl-ship-title"><FiTruck aria-hidden="true" /> Shipment details</h2>
      <dl>
        {s.partner && <div><dt>Courier partner</dt><dd>{s.partner}</dd></div>}
        {s.trackingNumber && <div><dt>Tracking number</dt><dd className="otl-mono">{s.trackingNumber}</dd></div>}
        {s.estimatedDelivery && <div><dt><FiCalendar aria-hidden="true" /> Estimated delivery</dt><dd>{day(s.estimatedDelivery)}</dd></div>}
      </dl>
      {s.customerRemarks && <p className="otl-remarks"><FiMessageSquare aria-hidden="true" /><span><b>Latest update</b>{s.customerRemarks}</span></p>}
      {url && <a className="otl-btn" href={url} target="_blank" rel="noopener noreferrer">Track Shipment <FiExternalLink aria-hidden="true" /><span className="otl-sr"> (opens in a new tab)</span></a>}
    </section>
  );
}
