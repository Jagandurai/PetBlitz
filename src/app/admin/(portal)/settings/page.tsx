"use client";
import { useEffect, useState } from "react";
import { FiFileText, FiPlus, FiRotateCcw, FiSave, FiTrash2, FiTruck } from "react-icons/fi";
import { Alert, Button, ErrorBox, Spinner, TextArea, TextField } from "@/components/ui";
import { GST_STATES } from "@/lib/gst";
import { api } from "@/lib/ui/api";
import { Can, useAdmin } from "@/lib/ui/admin";
import { minorToRupees, rupeesToMinor } from "@/lib/ui/format";
import { useAction, useApi } from "@/lib/ui/hooks";

interface S { shipping: { baseFeeMinor: number; freeAboveMinor: number | null; stateFees: Record<string, number> }; tax: { pricesIncludeTax: boolean; sellerStateCode?: string; sellerGstin?: string; legalName?: string; address?: string; invoicePrefix: string }; returns: { windowDays: number; petsReturnable: boolean } }

export default function Settings() {
  const { can } = useAdmin();
  const { data, loading, error, reload } = useApi<S>("/api/admin/settings");
  const { busy, run } = useAction();
  const [tab, setTab] = useState<"shipping" | "tax" | "returns">("shipping");
  const [f, setF] = useState({ base: "", free: "", fees: [] as { code: string; fee: string }[], incl: false, state: "33", gstin: "", legal: "", addr: "", prefix: "PB", days: "7", pets: false });
  useEffect(() => { if (data) setF({ base: minorToRupees(data.shipping.baseFeeMinor), free: minorToRupees(data.shipping.freeAboveMinor), fees: Object.entries(data.shipping.stateFees).map(([code, fee]) => ({ code, fee: minorToRupees(fee) })), incl: data.tax.pricesIncludeTax, state: data.tax.sellerStateCode ?? "33", gstin: data.tax.sellerGstin ?? "", legal: data.tax.legalName ?? "", addr: data.tax.address ?? "", prefix: data.tax.invoicePrefix, days: String(data.returns.windowDays), pets: data.returns.petsReturnable }); }, [data]);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} retry={reload} />;
  const ro = !can("settings.write");
  const save = async () => {
    const body = { shipping: { baseFeeMinor: rupeesToMinor(f.base || 0), freeAboveMinor: f.free ? rupeesToMinor(f.free) : null, stateFees: Object.fromEntries(f.fees.filter((x) => x.code && x.fee !== "").map((x) => [x.code, rupeesToMinor(x.fee)])) }, tax: { pricesIncludeTax: f.incl, sellerStateCode: f.state, sellerGstin: f.gstin, legalName: f.legal, address: f.addr, invoicePrefix: f.prefix }, returns: { windowDays: Number(f.days), petsReturnable: f.pets } };
    if (await run(() => api("/api/admin/settings", { method: "PATCH", body }), "Settings saved")) reload();
  };
  const Switch = ({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" role="switch" aria-checked={checked} className={"sw-row" + (checked ? " on" : "")} disabled={ro} onClick={() => onChange(!checked)}>
      <span className="sw"><i /></span><span className="sw-t"><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </button>
  );
  const TABS = [["shipping", "Shipping", <FiTruck key="a" />], ["tax", "GST & invoices", <FiFileText key="b" />], ["returns", "Returns", <FiRotateCcw key="c" />]] as const;
  return (
    <div className="set">
      <div className="top"><div><h1>Store settings</h1><p className="muted small" style={{ margin: 0 }}>Shipping, taxes, invoices and return policy for your storefront.</p></div></div>
      {ro && <Alert kind="info">Read-only for your role. Only owners can change settings.</Alert>}
      <div className="set-tabs" role="tablist">{TABS.map(([k, l, ic]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{ic}<span>{l}</span></button>)}</div>

      {tab === "shipping" && <div className="set-card">
        <div className="set-h"><span className="set-ic"><FiTruck /></span><div><h2>Shipping</h2><p>Delivery charges and free-shipping threshold.</p></div></div>
        <div className="grid g2"><TextField label="Standard shipping fee (₹)" type="number" value={f.base} onChange={(v) => setF({ ...f, base: v })} min={0} step="0.01" disabled={ro} /><TextField label="Free shipping above (₹)" type="number" value={f.free} onChange={(v) => setF({ ...f, free: v })} min={0} hint="Leave empty to never offer free shipping" disabled={ro} /></div>
        <div className="set-sub"><strong>State-specific fees</strong><span className="muted small">Override the standard fee for particular states</span></div>
        {f.fees.length === 0 && <div className="set-empty">No state-specific fees. The standard fee applies everywhere.</div>}
        {f.fees.map((x, i) => <div key={i} className="fee-row">
          <select value={x.code} disabled={ro} onChange={(e) => setF({ ...f, fees: f.fees.map((y, j) => (j === i ? { ...y, code: e.target.value } : y)) })}><option value="">Choose state…</option>{GST_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
          <input type="number" min={0} step="0.01" placeholder="₹ fee" value={x.fee} disabled={ro} onChange={(e) => setF({ ...f, fees: f.fees.map((y, j) => (j === i ? { ...y, fee: e.target.value } : y)) })} />
          <Button className="ghost sm" aria-label="Remove state fee" disabled={ro} onClick={() => setF({ ...f, fees: f.fees.filter((_, j) => j !== i) })}><FiTrash2 /></Button>
        </div>)}
        <div><Button className="ghost sm" disabled={ro} onClick={() => setF({ ...f, fees: [...f.fees, { code: "", fee: "" }] })}><FiPlus /> Add state fee</Button></div>
      </div>}

      {tab === "tax" && <div className="set-card">
        <div className="set-h"><span className="set-ic"><FiFileText /></span><div><h2>GST &amp; invoices</h2><p>Tax treatment and the details printed on invoices.</p></div></div>
        <Alert kind="warn">Have your accountant confirm these before going live: tax-inclusive vs exclusive pricing, GST rates and HSN codes (set per pet/product), GSTIN, and how shipping is taxed.</Alert>
        <Switch label="Prices already include GST" hint="Recommended for India consumer pricing" checked={f.incl} onChange={(v) => setF({ ...f, incl: v })} />
        <div className="grid g2"><label className="f">Seller state (decides CGST+SGST vs IGST)<select value={f.state} disabled={ro} onChange={(e) => setF({ ...f, state: e.target.value })}>{GST_STATES.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}</select></label><TextField label="GSTIN" value={f.gstin} onChange={(v) => setF({ ...f, gstin: v.toUpperCase() })} maxLength={15} disabled={ro} /><TextField label="Legal / trade name" value={f.legal} onChange={(v) => setF({ ...f, legal: v })} disabled={ro} /><TextField label="Invoice prefix" value={f.prefix} onChange={(v) => setF({ ...f, prefix: v.toUpperCase() })} maxLength={8} hint="Invoice no. looks like PB/2026-27/000001" disabled={ro} /></div>
        <TextArea label="Registered address (printed on invoices)" value={f.addr} onChange={(v) => setF({ ...f, addr: v })} maxLength={400} />
      </div>}

      {tab === "returns" && <div className="set-card">
        <div className="set-h"><span className="set-ic"><FiRotateCcw /></span><div><h2>Returns</h2><p>How long customers can return what they buy.</p></div></div>
        <div className="grid g2"><TextField label="Return window (days after delivery)" type="number" value={f.days} onChange={(v) => setF({ ...f, days: v })} min={0} disabled={ro} /></div>
        <Switch label="Allow returns of live animals" hint="Not recommended" checked={f.pets} onChange={(v) => setF({ ...f, pets: v })} />
      </div>}

      <Can perm="settings.write"><div className="savebar"><span className="muted small">Changes apply to the whole store once saved.</span><Button busy={busy} onClick={save}><FiSave /> Save settings</Button></div></Can>
    </div>
  );
}
