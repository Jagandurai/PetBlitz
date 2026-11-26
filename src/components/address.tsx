"use client";
import { TextField } from "./ui";
import { GST_STATES } from "@/lib/gst";
import { Field } from "./ui";

export const emptyAddress = { label: "Home", recipientName: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "Tamil Nadu", postalCode: "", countryCode: "IN" };
export type AddressDraft = typeof emptyAddress;

export function AddressForm({ value: v, onChange }: { value: AddressDraft; onChange: (a: AddressDraft) => void }) {
  const set = (k: keyof AddressDraft) => (x: string) => onChange({ ...v, [k]: x });
  return (
    <div className="grid g2">
      <TextField label="Full name" value={v.recipientName} onChange={set("recipientName")} required autoComplete="name" />
      <TextField label="Phone" value={v.phone} onChange={set("phone")} required autoComplete="tel" hint="e.g. +91 98765 43210" />
      <div style={{ gridColumn: "1/-1" }}><TextField label="Address line 1" value={v.line1} onChange={set("line1")} required autoComplete="address-line1" /></div>
      <TextField label="Address line 2" value={v.line2} onChange={set("line2")} autoComplete="address-line2" />
      <TextField label="Landmark" value={v.landmark} onChange={set("landmark")} />
      <TextField label="City" value={v.city} onChange={set("city")} required autoComplete="address-level2" />
      <Field label="State"><select value={v.state} onChange={(e) => set("state")(e.target.value)}>{GST_STATES.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}</select></Field>
      <TextField label="PIN code" value={v.postalCode} onChange={set("postalCode")} required autoComplete="postal-code" inputMode="numeric" />
      <TextField label="Label" value={v.label} onChange={set("label")} hint="Home, Work…" />
    </div>
  );
}
