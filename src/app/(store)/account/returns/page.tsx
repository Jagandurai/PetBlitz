"use client";
import Link from "next/link";
import { FiArrowRight, FiCheck, FiPackage, FiRefreshCw, FiRotateCcw } from "react-icons/fi";
import type { PublicSettings } from "@/components/store/types";
import { Badge, ErrorBox, Spinner } from "@/components/ui";
import { day, inr, title } from "@/lib/ui/format";
import { useApi } from "@/lib/ui/hooks";
import "./returns.css";

interface ReturnRow { _id: string; returnNumber: string; orderId: string; quantity: number; reason: string; status: string; refundAmount?: number; createdAt: string }

const STAGES = ["Requested", "Approved", "Received", "Refunded"];
const STAGE_OF: Record<string, number> = { requested: 0, approved: 1, received: 2, refunded: 3 };
const MEANING: Record<string, string> = {
  requested: "We have your request and will review it.",
  approved: "Your return has been approved.",
  received: "We have received the returned item.",
  refunded: "The refund has been added to your PetBlitz wallet.",
  rejected: "This return request was not approved. Contact support if you have questions.",
  closed: "This return request is closed.",
};

export default function Returns() {
  const { data, loading, error, reload } = useApi<{ items: ReturnRow[] }>("/api/me/returns?pageSize=50");
  const settings = useApi<PublicSettings>("/api/settings/public");
  const days = settings.data?.returns.windowDays;
  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} retry={reload} />;
  const items = data?.items ?? [];
  return (
    <div className="rtn">
      <header className="rtn-head">
        <div>
          <h1>Returns</h1>
          <p>{items.length ? `${items.length} return request${items.length === 1 ? "" : "s"}. ` : ""}{days ? `Delivered items can be returned within ${days} days.` : "Follow your return requests here."}</p>
        </div>
        <Link href="/return-policy" className="rtn-btn ghost">Return policy</Link>
      </header>

      {!items.length ? (
        <div className="rtn-empty">
          <i><FiRotateCcw aria-hidden="true" /></i>
          <b>No return requests</b>
          <p>To return something, open a delivered order and choose Return next to the item.</p>
          <Link href="/account/orders" className="rtn-btn">Go to my orders <FiArrowRight aria-hidden="true" /></Link>
        </div>
      ) : (
        <ul className="rtn-list">
          {items.map((r) => {
            const stage = STAGE_OF[r.status];
            return (
              <li key={r._id} className="rtn-card">
                <div className="rtn-top">
                  <i aria-hidden="true"><FiRefreshCw /></i>
                  <div><h2>{r.returnNumber}</h2><p>Requested on {day(r.createdAt)}</p></div>
                  <Badge status={r.status} label={title(r.status)} />
                </div>
                <dl className="rtn-facts">
                  <div><dt>Quantity</dt><dd>{r.quantity} item{r.quantity === 1 ? "" : "s"}</dd></div>
                  <div><dt>Reason</dt><dd>{title(r.reason)}</dd></div>
                  {r.refundAmount ? <div><dt>{r.status === "refunded" ? "Refunded" : "Refund amount"}</dt><dd className="money">{inr(r.refundAmount)}</dd></div> : null}
                </dl>
                {stage !== undefined && (
                  <ol className="rtn-track" aria-label={`Return progress: ${STAGES[stage]}`}>
                    {STAGES.map((s, n) => { const done = n < stage || stage === 3; return <li key={s} className={done ? "done" : n === stage ? "now" : ""}><span aria-hidden="true">{done ? <FiCheck /> : n + 1}</span>{s}</li>; })}
                  </ol>
                )}
                {MEANING[r.status] && <p className={`rtn-note${r.status === "rejected" ? " bad" : ""}`}>{MEANING[r.status]}</p>}
                <div className="rtn-actions">
                  <Link href="/account/support" className="rtn-btn ghost">Need help?</Link>
                  <Link href={`/account/orders/${r.orderId}`} className="rtn-btn"><FiPackage aria-hidden="true" /> View order</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
