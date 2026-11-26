"use client";
/* The customer's orders, used by My orders and Track an order. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { FiArrowRight, FiCreditCard, FiExternalLink, FiPackage } from "react-icons/fi";
import { ReturnInfo, isHttpUrl, normalizeStatus, orderStatusLabel } from "@/lib/order-status";
import { OrderTimeline, Shipment } from "./order-timeline";
import { Badge, ErrorBox, Pager, Spinner } from "@/components/ui";
import { dt, inr } from "@/lib/ui/format";
import { useApi } from "@/lib/ui/hooks";
import "./order-list.css";

interface OrderRow { _id: string; orderNumber: string; status: string; paymentStatus: string; grandTotal: number; createdAt: string; items: { name: string; quantity: number }[]; customerUnread?: boolean; statusHistory: { from?: string; to: string; at: string }[]; returnInfo?: ReturnInfo; shipping?: Shipment }

const words = (s: string) => s.replace(/_/g, " ");

export function OrderList() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<{ items: OrderRow[]; total: number; pageSize: number }>(`/api/me/orders?page=${page}&pageSize=10`);
  // keep statuses current while the page is open
  useEffect(() => { const load = () => { if (document.visibilityState === "visible") reload(); }; const t = setInterval(load, 30000); window.addEventListener("focus", load); return () => { clearInterval(t); window.removeEventListener("focus", load); }; }, [reload]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox msg={error} retry={reload} />;
  if (!data?.items.length) return (
    <div className="od-empty">
      <i><FiPackage aria-hidden="true" /></i>
      <b>No orders yet</b>
      <p>When you place an order, you can follow it here.</p>
      <Link href="/products" className="od-btn">Start shopping <FiArrowRight aria-hidden="true" /></Link>
    </div>
  );
  return (
    <>
      <ul className="od-list">
        {data.items.map((o) => {
          const track = o.shipping?.trackingUrl && isHttpUrl(o.shipping.trackingUrl) && o.status !== "cancelled" ? o.shipping.trackingUrl : null;
          const unpaid = o.status === "placed" && o.paymentStatus === "pending";
          const names = o.items.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ");
          return (
            <li key={o._id} className="od-card">
              <div className="od-top">
                <i aria-hidden="true"><FiPackage /></i>
                <div className="od-id">
                  <h2>{o.orderNumber}{o.customerUnread && <span className="ntf-new">Updated</span>}</h2>
                  <p>{dt(o.createdAt)}</p>
                </div>
                <b className="od-total">{inr(o.grandTotal)}</b>
              </div>
              <p className="od-items">{names}</p>
              <div className="od-badges">
                <Badge status={normalizeStatus(o.status)} label={orderStatusLabel(o.status)} />
                <Badge status={o.paymentStatus} label={`Payment: ${words(o.paymentStatus)}`} />
              </div>
              <div className="od-progress"><OrderTimeline compact status={o.status} history={o.statusHistory} createdAt={o.createdAt} returnInfo={o.returnInfo} /></div>
              {o.shipping?.trackingNumber && o.status !== "cancelled" && <p className="od-awb">{o.shipping.partner ?? "Courier"} · <strong>{o.shipping.trackingNumber}</strong></p>}
              <div className="od-actions">
                {track && <a href={track} target="_blank" rel="noopener noreferrer" className="od-btn ghost">Track Shipment <FiExternalLink aria-hidden="true" /></a>}
                {unpaid && <Link href={`/account/orders/${o._id}?pay=1`} className="od-btn pay"><FiCreditCard aria-hidden="true" /> Complete payment</Link>}
                <Link href={`/account/orders/${o._id}`} className="od-btn ghost" aria-label={`View details of order ${o.orderNumber}`}>View details <FiArrowRight aria-hidden="true" /></Link>
              </div>
            </li>
          );
        })}
      </ul>
      <Pager page={page} totalPages={Math.max(1, Math.ceil(data.total / (data.pageSize || 10)))} onPage={setPage} />
    </>
  );
}
