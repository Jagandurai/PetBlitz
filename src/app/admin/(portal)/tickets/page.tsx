"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Empty, ErrorBox, Pager, Spinner } from "@/components/ui";
import { qs } from "@/lib/ui/api";
import { dt } from "@/lib/ui/format";
import { useApi } from "@/lib/ui/hooks";

export default function Tickets() {
  const [status, setStatus] = useState("open"), [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<{ items: { _id: string; ticketNumber: string; subject: string; status: string; category: string; priority: string; lastMessageAt: string; messageCount: number; guest?: { email?: string } }[]; totalPages: number }>(`/api/admin/tickets${qs({ status, page, pageSize: 20 })}`);
  return (
    <div className="set pl">
      <div className="top"><div><h1>Support tickets</h1><p className="muted small" style={{ margin: 0 }}>Respond to customer questions and track their status.</p></div></div>
      <div className="set-tabs rt-tabs" role="tablist">{[["", "All"], ["open", "Open"], ["pending", "Pending"], ["resolved", "Resolved"], ["closed", "Closed"]].map(([v, l]) => <button key={v} role="tab" aria-selected={status === v} className={status === v ? "on" : ""} onClick={() => { setStatus(v!); setPage(1); }}><span style={{ display: "inline" }}>{l}</span></button>)}</div>
      {loading ? <Spinner /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.items.length ? <Empty>No tickets.</Empty> : <div className="set-card pl-tbl tw"><table className="t rt-t"><thead><tr><th>Ticket</th><th>Subject</th><th>Topic</th><th>Status</th><th>Last activity</th></tr></thead><tbody>{data.items.map((t) => <tr key={t._id}><td><Link className="pl-code" href={`/admin/tickets/${t._id}`}>{t.ticketNumber}</Link></td><td><strong>{t.subject}</strong><div className="small muted">{t.guest?.email ?? "customer"} · {t.messageCount} msg</div></td><td style={{ textTransform: "capitalize" }}>{t.category}</td><td><Badge status={t.status} /></td><td className="small nowrap">{dt(t.lastMessageAt)}</td></tr>)}</tbody></table></div>}
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
