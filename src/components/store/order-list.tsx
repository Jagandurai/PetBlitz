"use client";
/* The customer's orders, used by My orders and Track an order. */
import Link from "next/link";
import { useState } from "react";
import { FiArrowRight, FiCheck, FiCreditCard, FiPackage } from "react-icons/fi";
import { Badge, ErrorBox, Pager, Spinner } from "@/components/ui";
import { dt, inr } from "@/lib/ui/format";
import { useApi } from "@/lib/ui/hooks";
import "./order-list.css";

interface OrderRow { _id: string; orderNumber: string; status: string; paymentStatus: string; grandTotal: number; createdAt: string; items: { name: string; quantity: number }[]; customerUnread?: boolean }

const STAGES = ["Placed", "Confirmed", "Shipped", "Delivered"];
/** How far along each status is. Cancelled and refunded orders have no progress line. */
const STAGE_OF: Record<string, number> = { placed: 0, accepted: 1, confirmed: 1, processing: 1, shipped: 2, in_transit: 2, out_for_delivery: 2, delivered: 3 };
const words = (s: string) => s.replace(/_/g, " ");

export function OrderList() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<{ items: OrderRow[]; total: number; pageSize: number }>(`/api/me/orders?page=${page}&pageSize=10`);
  if (loading) return <Spinner />;
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
          const stage = STAGE_OF[o.status];
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
                <Badge status={o.status} label={words(o.status).replace(/^./, (c) => c.toUpperCase())} />
                <Badge status={o.paymentStatus} label={`Payment: ${words(o.paymentStatus)}`} />
              </div>
              {stage !== undefined && (
                <ol className="od-track" aria-label={`Order progress: ${STAGES[stage]}`}>
                  {STAGES.map((s, n) => <li key={s} className={n < stage || stage === 3 ? "done" : n === stage ? "now" : ""}><span aria-hidden="true">{n < stage || stage === 3 ? <FiCheck /> : n + 1}</span>{s}</li>)}
                </ol>
              )}
              <div className="od-actions">
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
