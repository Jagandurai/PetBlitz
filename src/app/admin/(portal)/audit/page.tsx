"use client";
import { useState } from "react";
import { Badge, Empty, ErrorBox, Pager, Select, Spinner } from "@/components/ui";
import { qs } from "@/lib/ui/api";
import { dt } from "@/lib/ui/format";
import { useApi } from "@/lib/ui/hooks";

export default function Audit() {
  const [page, setPage] = useState(1), [method, setMethod] = useState("");
  const { data, loading, error, reload } = useApi<{ items: { _id: string; at: string; actorType: string; actorEmail?: string; actorId?: string; role?: string; action: string; targetId?: string; status: number; ip?: string }[]; totalPages: number }>(`/api/admin/audit-logs${qs({ page, pageSize: 50, method })}`);
  return (
    <>
      <div className="top"><h1>Audit log</h1><Select label="Method" value={method} onChange={(v) => { setMethod(v); setPage(1); }} options={[{ value: "", label: "All writes" }, ...["POST", "PATCH", "DELETE"].map((v) => ({ value: v, label: v }))]} /></div>
      <p className="muted small">Every admin write and every denied attempt. Request bodies are never stored.</p>
      {loading ? <Spinner /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.items.length ? <Empty>No entries.</Empty> : <div className="card flush tw"><table className="t"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Result</th><th>IP</th></tr></thead><tbody>{data.items.map((a) => <tr key={a._id}><td className="small nowrap">{dt(a.at)}</td><td>{a.actorEmail ?? a.actorId ?? a.actorType}<div className="small muted">{a.role}</div></td><td className="mono">{a.action}</td><td className="mono small">{a.targetId?.slice(-8)}</td><td><Badge status={a.status < 400 ? "ok" : "bad"} label={String(a.status)} /></td><td className="small">{a.ip}</td></tr>)}</tbody></table></div>}
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
    </>
  );
}
