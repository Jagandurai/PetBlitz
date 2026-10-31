"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert, Badge, Button, Confirm, ErrorBox, Modal, Select, Spinner, TextField } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { Can } from "@/lib/ui/admin";
import { dt, inr, rupeesToMinor, title } from "@/lib/ui/format";
import { useAction, useApi } from "@/lib/ui/hooks";

export default function Customer() {
  const { id } = useParams<{ id: string }>();
  const c = useApi<{ _id: string; email: string; displayName?: string; phone?: string; status: string; walletBalance: number; addresses: { recipientName: string; line1: string; city: string; state: string; postalCode: string }[]; createdAt: string; lastLoginAt?: string }>(`/api/admin/customers/${id}`);
  const w = useApi<{ balance: number; transactions: { id: string; type: string; amount: number; balanceAfter: number; reason: string; description?: string; createdAt: string; createdBy?: string }[] }>(`/api/admin/customers/${id}/wallet?pageSize=30`);
  const { busy, run } = useAction();
  const [dlg, setDlg] = useState<"" | "adjust" | "status">(""), [f, setF] = useState({ dir: "credit", amount: "", reason: "" });
  const key = useMemo(() => `adj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, [dlg]); // eslint-disable-line react-hooks/exhaustive-deps
  if (c.loading) return <Spinner />;
  if (c.error || !c.data) return <ErrorBox msg={c.error ?? "Not found"} retry={c.reload} />;
  const u = c.data;
  const done = async (fn: () => Promise<unknown>, msg: string) => { if (await run(fn, msg) !== undefined) { setDlg(""); c.reload(); w.reload(); } };
  return (
    <div className="set sd">
      <div className="top"><div><Link href="/admin/customers">← Customers</Link><h1>{u.displayName ?? u.email}</h1></div><Badge status={u.status} /></div>
      <div className="grid g3 cd-stats"><div className="card cd-stat"><span className="cd-k">E-mail</span><strong>{u.email}</strong><span className="cd-k">Phone</span><strong>{u.phone ?? "—"}</strong></div><div className="card cd-stat cd-wallet"><span className="cd-k">Wallet balance</span><b className="cd-big">{inr(u.walletBalance)}</b><span className="cd-k">Available store credit</span></div><div className="card cd-stat"><span className="cd-k">Joined</span><strong>{dt(u.createdAt)}</strong><span className="cd-k">Last login</span><strong>{dt(u.lastLoginAt)}</strong></div></div>
      <div className="row"><Link className="btn ghost" href={`/admin/orders?customerId=${u._id}`}>View orders</Link>
        <Can perm="finance.write"><Button onClick={() => { setF({ dir: "credit", amount: "", reason: "" }); setDlg("adjust"); }}>Adjust wallet</Button><Button className="ghost" busy={busy} onClick={async () => { const r = await run(() => api<{ consistent: boolean; balance: number; ledger: number }>(`/api/admin/customers/${id}/wallet/reconcile`, { method: "POST", body: { fix: false } })); if (r) alert(r.consistent ? "Wallet matches the ledger ✔" : `MISMATCH: balance ${inr(r.balance)} vs ledger ${inr(r.ledger)}`); }}>Check ledger</Button></Can>
        <Can perm="customers.write">{u.status !== "deleted" && <Button className="ghost" onClick={() => setDlg("status")}>{u.status === "active" ? "Suspend…" : "Reactivate"}</Button>}</Can></div>
      <div className="card flush"><h3 className="cd-h">Wallet ledger</h3><div className="tw"><table className="t"><thead><tr><th>Date</th><th>Entry</th><th>By</th><th className="right">Amount</th><th className="right">Balance</th></tr></thead><tbody>{w.data?.transactions.map((t) => <tr key={t.id}><td className="small nowrap">{dt(t.createdAt)}</td><td>{title(t.reason)} <span className="muted small">{t.description}</span></td><td className="small muted">{t.createdBy ?? "system"}</td><td className="right"><Badge status={t.type === "credit" ? "ok" : "bad"} label={`${t.type === "credit" ? "+" : "−"}${inr(t.amount)}`} /></td><td className="right pl-amt">{inr(t.balanceAfter)}</td></tr>)}{!w.data?.transactions.length && <tr><td colSpan={5} className="center muted" style={{ padding: 28 }}>No wallet activity yet.</td></tr>}</tbody></table></div></div>
      <div className="card"><h3>Addresses</h3>{u.addresses.length ? u.addresses.map((a, i) => <div key={i} className="cd-addr">{a.recipientName}, {a.line1}, {a.city}, {a.state} {a.postalCode}</div>) : <span className="muted">None</span>}</div>
      <Modal open={dlg === "adjust"} onClose={() => setDlg("")} title="Adjust wallet"><div className="col"><Alert kind="warn">Manual adjustments are permanent, ledgered and audited. Debits cannot overdraw the wallet.</Alert>
        <Select label="Type" value={f.dir} onChange={(v) => setF({ ...f, dir: v })} options={[{ value: "credit", label: "Credit (add money)" }, { value: "debit", label: "Debit (remove money)" }]} /><TextField label="Amount ₹" type="number" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} min={0} step="0.01" /><TextField label="Reason (required)" value={f.reason} onChange={(v) => setF({ ...f, reason: v })} />
        <Button busy={busy} disabled={!f.amount || f.reason.length < 3} onClick={() => done(() => api(`/api/admin/customers/${id}/wallet/adjust`, { method: "POST", body: { direction: f.dir, amount: rupeesToMinor(f.amount), reason: f.reason, idempotencyKey: key } }), "Wallet adjusted")}>Apply</Button></div></Modal>
      <Confirm open={dlg === "status"} onClose={() => setDlg("")} danger={u.status === "active"} busy={busy} title={u.status === "active" ? "Suspend customer?" : "Reactivate customer?"} confirmLabel="Confirm" onConfirm={() => done(() => api(`/api/admin/customers/${id}/status`, { method: "PATCH", body: { status: u.status === "active" ? "suspended" : "active" } }), "Status updated")}><p>{u.status === "active" ? "They are signed out on their next request and cannot place orders." : "They can sign in and order again."}</p></Confirm>
    </div>
  );
}
