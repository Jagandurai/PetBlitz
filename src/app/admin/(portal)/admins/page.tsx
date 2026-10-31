"use client";
import { useState } from "react";
import { Alert, Badge, Button, ErrorBox, Modal, Select, Spinner, TextField } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { dt } from "@/lib/ui/format";
import { useAction, useApi } from "@/lib/ui/hooks";

interface A { id: string; email: string; name: string; role: string; isActive: boolean; mfaEnabled: boolean; lastLoginAt?: string }
const ROLES = [["owner", "Owner — everything"], ["catalog", "Catalog — categories, pets, products, coupons"], ["orders", "Orders — fulfilment, returns (no refunds)"], ["finance", "Finance — refunds, wallet adjustments"], ["support", "Support — tickets, reviews"]];

export default function Admins() {
  const { data, loading, error, reload } = useApi<{ admins: A[] }>("/api/admin/admins");
  const { busy, run } = useAction();
  const [dlg, setDlg] = useState<"" | "new" | "edit" | "pw">(""), [sel, setSel] = useState<A | null>(null), [f, setF] = useState({ email: "", name: "", role: "support", password: "" });
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error ?? "Failed"} retry={reload} />;
  const done = async (fn: () => Promise<unknown>, msg: string) => { if (await run(fn, msg) !== undefined) { setDlg(""); reload(); } };
  return (
    <>
      <div className="top"><h1>Admins</h1><Button onClick={() => { setF({ email: "", name: "", role: "support", password: "" }); setDlg("new"); }}>+ New admin</Button></div>
      <Alert kind="info">Roles limit what each person can do; every write is recorded in the audit log. Changing a role or deactivating an account signs that person out immediately.</Alert>
      <div className="card flush tw mt"><table className="t"><thead><tr><th>Name</th><th>Role</th><th>MFA</th><th>Last login</th><th>Status</th><th /></tr></thead><tbody>{data.admins.map((a) => <tr key={a.id}><td><strong>{a.name}</strong><div className="small muted">{a.email}</div></td><td>{a.role}</td><td><Badge status={a.mfaEnabled ? "ok" : "warn"} label={a.mfaEnabled ? "On" : "Off"} /></td><td className="small">{dt(a.lastLoginAt)}</td><td><Badge status={a.isActive ? "active" : "suspended"} label={a.isActive ? "Active" : "Disabled"} /></td><td className="right nowrap"><Button className="ghost sm" onClick={() => { setSel(a); setF({ ...f, name: a.name, role: a.role }); setDlg("edit"); }}>Edit</Button> <Button className="ghost sm" onClick={() => { setSel(a); setF({ ...f, password: "" }); setDlg("pw"); }}>Reset password</Button></td></tr>)}</tbody></table></div>
      <Modal open={dlg === "new"} onClose={() => setDlg("")} title="New admin"><div className="col"><TextField label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} /><TextField label="E-mail" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} /><Select label="Role" value={f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLES.map(([v, l]) => ({ value: v!, label: l! }))} /><TextField label="Temporary password" type="password" value={f.password} onChange={(v) => setF({ ...f, password: v })} hint="Min 12 characters, mixed case/digits. Share it securely; they should change it and enable MFA." autoComplete="new-password" /><Button busy={busy} disabled={!f.email || !f.name || f.password.length < 12} onClick={() => done(() => api("/api/admin/admins", { method: "POST", body: f }), "Admin created")}>Create</Button></div></Modal>
      <Modal open={dlg === "edit"} onClose={() => setDlg("")} title={`Edit ${sel?.name}`}><div className="col"><TextField label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} /><Select label="Role" value={f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLES.map(([v, l]) => ({ value: v!, label: l! }))} />
        <div className="row"><Button busy={busy} onClick={() => sel && done(() => api(`/api/admin/admins/${sel.id}`, { method: "PATCH", body: { name: f.name, role: f.role } }), "Saved")}>Save</Button><Button className={sel?.isActive ? "danger" : ""} busy={busy} onClick={() => sel && done(() => api(`/api/admin/admins/${sel.id}`, { method: "PATCH", body: { isActive: !sel.isActive } }), sel.isActive ? "Disabled" : "Enabled")}>{sel?.isActive ? "Disable account" : "Enable account"}</Button></div></div></Modal>
      <Modal open={dlg === "pw"} onClose={() => setDlg("")} title={`Reset password · ${sel?.name}`}><div className="col"><TextField label="New password" type="password" value={f.password} onChange={(v) => setF({ ...f, password: v })} autoComplete="new-password" /><Button busy={busy} disabled={f.password.length < 12} onClick={() => sel && done(() => api(`/api/admin/admins/${sel.id}/reset-password`, { method: "POST", body: { password: f.password } }), "Password reset; sessions revoked")}>Reset</Button></div></Modal>
    </>
  );
}
