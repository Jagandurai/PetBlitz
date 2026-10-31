"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";
import { Badge, Button, Empty, ErrorBox, Pager, Select, Spinner, TextField } from "@/components/ui";
import { qs } from "@/lib/ui/api";
import { dt, inr } from "@/lib/ui/format";
import { useApi } from "@/lib/ui/hooks";

const STATUSES = ["placed", "accepted", "confirmed", "processing", "shipped", "in_transit", "out_for_delivery", "delivered", "cancelled", "refund_initiated", "refunded"];
interface Row { _id: string; orderNumber: string; status: string; paymentStatus: string; grandTotal: number; createdAt: string; customerSnapshot?: { name?: string; email?: string } }

function Inner() {
  const sp = useSearchParams();
  const [f, setF] = useState({ status: sp.get("status") ?? "", paymentStatus: sp.get("paymentStatus") ?? "", q: "", customerId: sp.get("customerId") ?? "" });
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<{ items: Row[]; totalPages: number; total: number }>(`/api/admin/orders${qs({ ...f, q: f.q.length >= 3 ? f.q : undefined, page, pageSize: 20 })}`);
  return (
    <div className="set pl">
      <div className="top"><div><h1>Orders</h1><p className="muted small" style={{ margin: 0 }}>Track, filter and fulfil customer orders.{data ? ` ${data.total} found.` : ""}</p></div><Button className="ghost sm" onClick={reload}><FiRefreshCw /> Refresh</Button></div>
      <div className="set-card pl-filter">
        <Select label="Status" value={f.status} onChange={(v) => { setF({ ...f, status: v }); setPage(1); }} options={[{ value: "", label: "All" }, ...STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))]} />
        <Select label="Payment" value={f.paymentStatus} onChange={(v) => { setF({ ...f, paymentStatus: v }); setPage(1); }} options={[{ value: "", label: "All" }, ...["pending", "paid", "failed", "partially_refunded", "refunded"].map((s) => ({ value: s, label: s.replace(/_/g, " ") }))]} />
        <TextField label="Order number" value={f.q} onChange={(v) => setF({ ...f, q: v })} placeholder="PB-2026-000123" hint="Exact match" />
        {f.customerId && <Button className="ghost sm" onClick={() => setF({ ...f, customerId: "" })}>Clear customer filter</Button>}
      </div>
      {loading ? <Spinner /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.items.length ? <Empty>No orders match.</Empty> : (
        <div className="set-card pl-tbl tw"><table className="t"><thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Status</th><th>Payment</th><th className="right">Total</th></tr></thead><tbody>
          {data.items.map((o) => <tr key={o._id}><td><Link className="pl-code" href={`/admin/orders/${o._id}`}>{o.orderNumber}</Link></td><td><div className="pl-person"><span className="pl-av">{(o.customerSnapshot?.name ?? o.customerSnapshot?.email ?? "?")[0]!.toUpperCase()}</span><span><strong>{o.customerSnapshot?.name}</strong><small>{o.customerSnapshot?.email}</small></span></div></td><td className="small nowrap">{dt(o.createdAt)}</td><td><Badge status={o.status} /></td><td><Badge status={o.paymentStatus} /></td><td className="right pl-amt">{inr(o.grandTotal)}</td></tr>)}
        </tbody></table></div>)}
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
export default function Orders() { return <Suspense fallback={<Spinner />}><Inner /></Suspense>; }
