"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Empty, ErrorBox, Pager, Select, Spinner, TextField } from "@/components/ui";
import { qs } from "@/lib/ui/api";
import { dt, inr } from "@/lib/ui/format";
import { useApi } from "@/lib/ui/hooks";

export default function Customers() {
  const [q, setQ] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1);
  const valid = /^\S+@\S+\.\S+$/.test(q);
  const { data, loading, error, reload } = useApi<{ items: { _id: string; email: string; displayName?: string; status: string; walletBalance: number; createdAt: string }[]; totalPages: number }>(`/api/admin/customers${qs({ q: valid ? q : undefined, status, page, pageSize: 20 })}`);
  return (
    <div className="set pl">
      <div className="top"><div><h1>Customers</h1><p className="muted small" style={{ margin: 0 }}>Look up customers, wallet balances and account status.</p></div></div>
      <div className="set-card pl-filter"><div className="grow"><TextField label="Find by exact e-mail" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="name@example.com" /></div><Select label="Status" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }, { value: "deleted", label: "Deleted" }]} /></div>
      {loading ? <Spinner /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.items.length ? <Empty>No customers.</Empty> : <div className="set-card pl-tbl tw"><table className="t"><thead><tr><th>Customer</th><th>Status</th><th>Joined</th><th className="right">Wallet</th></tr></thead><tbody>{data.items.map((c) => <tr key={c._id}><td><Link className="pl-person" href={`/admin/customers/${c._id}`}><span className="pl-av">{(c.displayName ?? c.email)[0]!.toUpperCase()}</span><span><strong>{c.displayName ?? c.email}</strong><small>{c.email}</small></span></Link></td><td><Badge status={c.status} /></td><td className="small nowrap">{dt(c.createdAt)}</td><td className="right pl-amt">{inr(c.walletBalance)}</td></tr>)}</tbody></table></div>}
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  );
}
