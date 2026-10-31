"use client";
import { useState } from "react";
import { FiPlus } from "react-icons/fi";
import { Badge, Button, Check, Empty, ErrorBox, Modal, Pager, Select, Spinner, TextField } from "@/components/ui";
import { api, qs } from "@/lib/ui/api";
import { Can } from "@/lib/ui/admin";
import { day, inr, rupeesToMinor } from "@/lib/ui/format";
import { useAction, useApi } from "@/lib/ui/hooks";

interface C { _id: string; code: string; description?: string; type: string; value: number; minOrderMinor: number; maxDiscountMinor?: number; appliesTo: string; startsAt?: string; endsAt?: string; usageLimit?: number; usedCount: number; perCustomerLimit: number; isActive: boolean }
const blank = { code: "", description: "", type: "percent", value: "10", minOrder: "0", maxDiscount: "", appliesTo: "all", ends: "", usageLimit: "", perCustomer: "1", active: true };

export default function Coupons() {
  const [page, setPage] = useState(1), [open, setOpen] = useState(false), [f, setF] = useState(blank);
  const { data, loading, error, reload } = useApi<{ items: C[]; totalPages: number }>(`/api/admin/coupons${qs({ page, pageSize: 20 })}`);
  const { busy, run } = useAction();
  const create = async () => {
    const body = { code: f.code, description: f.description || undefined, type: f.type, value: f.type === "percent" ? Number(f.value) : rupeesToMinor(f.value), minOrderMinor: rupeesToMinor(f.minOrder || 0), maxDiscountMinor: f.maxDiscount ? rupeesToMinor(f.maxDiscount) : undefined, appliesTo: f.appliesTo, endsAt: f.ends ? new Date(f.ends + "T23:59:59").toISOString() : undefined, usageLimit: f.usageLimit ? Number(f.usageLimit) : undefined, perCustomerLimit: Number(f.perCustomer || 1), isActive: f.active };
    if (await run(() => api("/api/admin/coupons", { method: "POST", body }), "Coupon created")) { setOpen(false); setF(blank); reload(); }
  };
  const toggle = async (c: C) => { if (await run(() => api(`/api/admin/coupons/${c._id}`, { method: "PATCH", body: { isActive: !c.isActive } }), c.isActive ? "Deactivated" : "Activated")) reload(); };
  return (
    <div className="set pl">
      <div className="top"><div><h1>Coupons</h1><p className="muted small" style={{ margin: 0 }}>Create and manage discount codes for your storefront.</p></div><Can perm="marketing.write"><Button onClick={() => setOpen(true)}><FiPlus /> New coupon</Button></Can></div>
      {loading ? <Spinner /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.items.length ? <Empty>No coupons yet.</Empty> : <div className="set-card pl-tbl tw"><table className="t"><thead><tr><th>Code</th><th>Discount</th><th>Rules</th><th>Used</th><th>Valid until</th><th>Status</th><th /></tr></thead><tbody>{data.items.map((c) => <tr key={c._id}><td><span className="pl-coupon">{c.code}</span><div className="small muted" style={{ marginTop: 4 }}>{c.description}</div></td><td className="pl-amt">{c.type === "percent" ? `${c.value}%` : inr(c.value)}{c.maxDiscountMinor ? <div className="small muted">max {inr(c.maxDiscountMinor)}</div> : null}</td><td className="small">min {inr(c.minOrderMinor)} · {c.appliesTo} · {c.perCustomerLimit}/customer</td><td><div className="pl-use"><span>{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</span>{c.usageLimit ? <i><b style={{ width: `${Math.min(100, (c.usedCount / c.usageLimit) * 100)}%` }} /></i> : null}</div></td><td className="small">{c.endsAt ? day(c.endsAt) : "No expiry"}</td><td><Badge status={c.isActive ? "active" : "closed"} label={c.isActive ? "Active" : "Off"} /></td><td className="right"><Can perm="marketing.write"><Button className="ghost sm" onClick={() => toggle(c)}>{c.isActive ? "Turn off" : "Turn on"}</Button></Can></td></tr>)}</tbody></table></div>}
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
      <Modal open={open} onClose={() => setOpen(false)} title="New coupon"><div className="col">
        <TextField label="Code" value={f.code} onChange={(v) => setF({ ...f, code: v.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} hint="3–40 letters/digits, e.g. WELCOME10" /><TextField label="Description" value={f.description} onChange={(v) => setF({ ...f, description: v })} />
        <div className="grid g2"><Select label="Type" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[{ value: "percent", label: "Percent off" }, { value: "fixed", label: "Fixed ₹ off" }]} /><TextField label={f.type === "percent" ? "Percent (1–100)" : "Amount ₹"} type="number" value={f.value} onChange={(v) => setF({ ...f, value: v })} min={0} step="0.01" />
          <TextField label="Minimum order ₹" type="number" value={f.minOrder} onChange={(v) => setF({ ...f, minOrder: v })} min={0} /><TextField label="Max discount ₹ (optional)" type="number" value={f.maxDiscount} onChange={(v) => setF({ ...f, maxDiscount: v })} min={0} />
          <Select label="Applies to" value={f.appliesTo} onChange={(v) => setF({ ...f, appliesTo: v })} options={[{ value: "all", label: "Everything" }, { value: "products", label: "Accessories only" }, { value: "pets", label: "Pets only" }]} /><TextField label="Expires on" type="date" value={f.ends} onChange={(v) => setF({ ...f, ends: v })} />
          <TextField label="Total uses (optional)" type="number" value={f.usageLimit} onChange={(v) => setF({ ...f, usageLimit: v })} min={1} /><TextField label="Uses per customer" type="number" value={f.perCustomer} onChange={(v) => setF({ ...f, perCustomer: v })} min={1} /></div>
        <Check label="Active immediately" checked={f.active} onChange={(v) => setF({ ...f, active: v })} /><Button busy={busy} disabled={f.code.length < 3 || !f.value} onClick={create}>Create coupon</Button></div></Modal>
    </div>
  );
}
