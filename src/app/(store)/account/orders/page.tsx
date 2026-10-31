"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Empty, ErrorBox, Pager, Spinner } from "@/components/ui";
import { dt, inr } from "@/lib/ui/format";
import { useApi } from "@/lib/ui/hooks";

export interface OrderRow { _id: string; orderNumber: string; status: string; paymentStatus: string; grandTotal: number; createdAt: string; items: { name: string; quantity: number }[] }

export default function Orders() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<{ items: OrderRow[]; total: number; pageSize: number }>(`/api/me/orders?page=${page}&pageSize=10`);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} retry={reload} />;
  return (
    <>
      <h1>My orders</h1>
      {!data?.items.length ? <Empty>No orders yet. <Link href="/pets">Start shopping</Link></Empty> : data.items.map((o) => (
        <Link key={o._id} href={`/account/orders/${o._id}`} className="card row between" style={{ color: "inherit" }}>
          <div><strong>{o.orderNumber}</strong><div className="small muted">{dt(o.createdAt)} · {o.items.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ").slice(0, 90)}</div></div>
          <div className="row"><Badge status={o.status} /><Badge status={o.paymentStatus} label={`Payment: ${o.paymentStatus}`} /><strong>{inr(o.grandTotal)}</strong></div>
        </Link>
      ))}
      <Pager page={page} totalPages={Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 10)))} onPage={setPage} />
    </>
  );
}
