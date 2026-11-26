"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FiArchive, FiRefreshCw } from "react-icons/fi";
import { Badge, Button, Empty, ErrorBox, Pager, Select, Spinner, TextField, useDebounced } from "@/components/ui";
import { STAGE_KEYS, normalizeStatus, orderStatusLabel } from "@/lib/order-status";
import { qs } from "@/lib/ui/api";
import { dt, inr } from "@/lib/ui/format";
import { useApi } from "@/lib/ui/hooks";
import { Can } from "@/lib/ui/admin";
import { ClearHistory, RowMenu } from "./history-tools";

const STATUSES = [...STAGE_KEYS, "to_ship", "cancelled", "refund_initiated", "refunded"];
interface Row { _id: string; orderNumber: string; status: string; paymentStatus: string; grandTotal: number; createdAt: string; adminUnread?: boolean; archivedAt?: string; customerSnapshot?: { name?: string; email?: string } }

function Inner() {
  const sp = useSearchParams();
  const [f, setF] = useState({ status: sp.get("status") ?? "", paymentStatus: sp.get("paymentStatus") ?? "", q: "", customerId: sp.get("customerId") ?? "" });
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"active" | "archived">("active"), [clearing, setClearing] = useState(false);
  const typed = useDebounced(f.q.trim(), 250), q = f.q.trim() ? typed : ""; // clearing the box takes effect at once
  const { data, loading, error, reload } = useApi<{ items: Row[]; totalPages: number; total: number }>(`/api/admin/orders${qs({ ...f, q, view, page, pageSize: 20 })}`);
  // removing the only order on a later page goes back one page
  const refresh = () => { if (data?.items.length === 1 && page > 1) setPage(page - 1); else reload(); };
  return (
    <div className="set pl">
      <div className="top"><div><h1>Orders</h1><p className="muted small" style={{ margin: 0 }}>Track, filter and fulfil customer orders.{data ? ` ${data.total} found.` : ""}</p></div><div className="ord-actions"><Button className="ghost sm" onClick={reload}><FiRefreshCw /> Refresh</Button><Can perm="orders.write"><Button className="ghost sm" onClick={() => setClearing(true)}><FiArchive /> Clear order history</Button></Can></div></div>
      <div className="ord-views" role="tablist" aria-label="Order list">{(["active", "archived"] as const).map((v) => <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => { setView(v); setPage(1); }}>{v === "active" ? "Active" : "Archived"}</button>)}</div>
      <div className="set-card pl-filter">
        <Select label="Status" value={f.status} onChange={(v) => { setF({ ...f, status: v }); setPage(1); }} options={[{ value: "", label: "All" }, ...STATUSES.map((s) => ({ value: s, label: orderStatusLabel(s) }))]} />
        <Select label="Payment" value={f.paymentStatus} onChange={(v) => { setF({ ...f, paymentStatus: v }); setPage(1); }} options={[{ value: "", label: "All" }, ...["pending", "paid", "failed", "partially_refunded", "refunded"].map((s) => ({ value: s, label: s.replace(/_/g, " ") }))]} />
        <TextField label="Order number" type="search" value={f.q} onChange={(v) => { setF({ ...f, q: v }); setPage(1); }} placeholder="PB-2026-000123" maxLength={30} />
        {f.customerId && <Button className="ghost sm" onClick={() => setF({ ...f, customerId: "" })}>Clear customer filter</Button>}
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.items.length ? <Empty>No orders match.</Empty> : (
        <div className="set-card pl-tbl tw"><table className="t"><thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Status</th><th>Payment</th><th className="right">Total</th><th className="ord-end"><span style={{ position: "absolute", left: -9999 }}>Actions</span></th></tr></thead><tbody>
          {data.items.map((o) => <tr key={o._id}><td><Link className="pl-code" href={`/admin/orders/${o._id}`}>{o.orderNumber}</Link>{o.adminUnread && <span className="ntf-new">New</span>}</td><td><div className="pl-person"><span className="pl-av">{(o.customerSnapshot?.name ?? o.customerSnapshot?.email ?? "?")[0]!.toUpperCase()}</span><span><strong>{o.customerSnapshot?.name}</strong><small>{o.customerSnapshot?.email}</small></span></div></td><td className="small nowrap">{dt(o.createdAt)}</td><td><Badge status={normalizeStatus(o.status)} label={orderStatusLabel(o.status)} /></td><td><Badge status={o.paymentStatus} /></td><td className="right pl-amt">{inr(o.grandTotal)}</td><td className="ord-end"><RowMenu order={o} onChanged={refresh} /></td></tr>)}
        </tbody></table></div>)}
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
      <ClearHistory open={clearing} onClose={() => setClearing(false)} onChanged={() => { setPage(1); reload(); }} />
    </div>
  );
}
export default function Orders() { return <Suspense fallback={<Spinner />}><Inner /></Suspense>; }
