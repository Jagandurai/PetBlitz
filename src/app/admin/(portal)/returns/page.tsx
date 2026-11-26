"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Empty, ErrorBox, Modal, Pager, Select, Spinner, TextField } from "@/components/ui";
import { api, qs } from "@/lib/ui/api";
import { Can } from "@/lib/ui/admin";
import { dt, inr, title } from "@/lib/ui/format";
import { useAction, useApi } from "@/lib/ui/hooks";

const STATES = ["requested", "approved", "received", "refunded", "rejected", "closed"];
interface R { _id: string; returnNumber: string; orderId: string; quantity: number; reason: string; details?: string; status: string; refundAmount?: number; createdAt: string }
export default function Returns() {
  const [status, setStatus] = useState("requested"), [page, setPage] = useState(1), [note, setNote] = useState(""), [pick, setPick] = useState<{ r: R; action: string } | null>(null), [dest, setDest] = useState("wallet");
  const { data, loading, error, reload } = useApi<{ items: R[]; totalPages: number }>(`/api/admin/returns${qs({ status, page, pageSize: 20 })}`);
  const { busy, run } = useAction();
  const go = async () => { if (!pick) return; const ok = await run(() => pick.action === "refund" ? api(`/api/admin/returns/${pick.r._id}/refund`, { method: "POST", body: { destination: dest } }) : api(`/api/admin/returns/${pick.r._id}/action`, { method: "POST", body: { action: pick.action, note: note || undefined } }), "Done"); if (ok) { setPick(null); setNote(""); reload(); } };
  return (
    <div className="set pl">
      <div className="top"><div><h1>Returns</h1><p className="muted small" style={{ margin: 0 }}>Review return requests, receive items and issue refunds.</p></div></div>
      <div className="set-tabs rt-tabs" role="tablist">{STATES.map((v) => <button key={v} role="tab" aria-selected={status === v} className={status === v ? "on" : ""} onClick={() => { setStatus(v); setPage(1); }}><span style={{ display: "inline" }}>{title(v)}</span></button>)}</div>
      {loading ? <Spinner /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.items.length ? <Empty>No returns in this state.</Empty> : (
        <div className="set-card pl-tbl tw"><table className="t rt-t"><thead><tr><th>Return</th><th>Reason</th><th className="right">Qty</th><th>Requested</th><th>Status</th><th className="right">Refund</th><th className="right">Actions</th></tr></thead><tbody>
          {data.items.map((r) => <tr key={r._id}>
            <td><span className="pl-code">{r.returnNumber}</span><div><Link className="small" href={`/admin/orders/${r.orderId}`}>View order →</Link></div></td>
            <td><strong>{title(r.reason)}</strong>{r.details && <div className="small muted rt-det">{r.details}</div>}</td>
            <td className="right">{r.quantity}</td>
            <td className="small nowrap">{dt(r.createdAt)}</td>
            <td><Badge status={r.status} /></td>
            <td className="right pl-amt">{r.refundAmount ? inr(r.refundAmount) : "—"}</td>
            <td className="right nowrap"><div className="rt-act"><Can perm="orders.write">{r.status === "requested" && <><Button className="sm" onClick={() => setPick({ r, action: "approve" })}>Approve</Button><Button className="ghost sm" onClick={() => setPick({ r, action: "reject" })}>Reject</Button></>}{r.status === "approved" && <Button className="sm" onClick={() => setPick({ r, action: "receive" })}>Mark received</Button>}{["rejected", "refunded", "received", "approved"].includes(r.status) && <Button className="ghost sm" onClick={() => setPick({ r, action: "close" })}>Close</Button>}</Can>
              <Can perm="finance.write">{r.status === "received" && <Button className="sm" onClick={() => setPick({ r, action: "refund" })}>Refund…</Button>}</Can></div></td></tr>)}
        </tbody></table></div>)}
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
      <Modal open={!!pick} onClose={() => setPick(null)} title={pick ? `${title(pick.action)} ${pick.r.returnNumber}` : ""}><div className="col">
        {pick?.action === "refund" ? <Select label="Refund to" value={dest} onChange={setDest} options={[{ value: "wallet", label: "Customer wallet (instant)" }, { value: "original", label: "Original payment method" }]} hint="Amount = proportional value of the returned items incl. GST" /> : <TextField label="Note to customer (optional)" value={note} onChange={setNote} />}
        <Button busy={busy} onClick={go}>Confirm</Button></div></Modal>
    </div>
  );
}
