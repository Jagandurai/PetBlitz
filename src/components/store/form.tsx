"use client";
import { ReactNode } from "react";
import { GST_STATES } from "@/lib/gst";

export const emptyAddr = { label: "Home", recipientName: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "Tamil Nadu", postalCode: "", countryCode: "IN" };
export type AddrDraft = typeof emptyAddr;
export const addrBody = (v: AddrDraft) => ({ ...v, line2: v.line2 || undefined, landmark: v.landmark || undefined });
export const addrValid = (v: AddrDraft) => v.recipientName.trim().length > 1 && /^\+?[0-9 ()-]{7,20}$/.test(v.phone.trim()) && v.line1.trim().length > 2 && v.city.trim().length > 1 && /^\d{6}$/.test(v.postalCode.trim());

export const FField = ({ label, children, error, span }: { label: string; children: ReactNode; error?: string; span?: boolean }) => <label style={{ display: "flex", flexDirection: "column", gap: 5, fontWeight: 600, fontSize: ".86rem", gridColumn: span ? "1/-1" : undefined }}>{label}{children}{error && <span style={{ color: "var(--deal)", fontWeight: 500 }}>{error}</span>}</label>;

export function AddressFields({ v, set }: { v: AddrDraft; set: (a: AddrDraft) => void }) {
  const u = (k: keyof AddrDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set({ ...v, [k]: e.target.value });
  const pinBad = v.postalCode !== "" && !/^\d{6}$/.test(v.postalCode), phoneBad = v.phone !== "" && !/^\+?[0-9 ()-]{7,20}$/.test(v.phone);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
      <FField label="Full name"><input className="sf-in" value={v.recipientName} onChange={u("recipientName")} autoComplete="name" /></FField>
      <FField label="Mobile number" error={phoneBad ? "Enter a valid phone number" : undefined}><input className="sf-in" value={v.phone} onChange={u("phone")} inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" /></FField>
      <FField label="Address (house no., street)" span><input className="sf-in" value={v.line1} onChange={u("line1")} autoComplete="address-line1" /></FField>
      <FField label="Area / apartment"><input className="sf-in" value={v.line2} onChange={u("line2")} autoComplete="address-line2" /></FField>
      <FField label="Landmark (optional)"><input className="sf-in" value={v.landmark} onChange={u("landmark")} /></FField>
      <FField label="PIN code" error={pinBad ? "6 digits" : undefined}><input className="sf-in" value={v.postalCode} onChange={(e) => set({ ...v, postalCode: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" autoComplete="postal-code" /></FField>
      <FField label="City"><input className="sf-in" value={v.city} onChange={u("city")} autoComplete="address-level2" /></FField>
      <FField label="State"><select className="sf-in" value={v.state} onChange={u("state")}>{GST_STATES.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}</select></FField>
      <FField label="Save as"><select className="sf-in" value={v.label} onChange={u("label")}><option>Home</option><option>Work</option><option>Other</option></select></FField>
    </div>
  );
}
