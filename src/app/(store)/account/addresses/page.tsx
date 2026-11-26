"use client";
import { useState } from "react";
import { FiBriefcase, FiCheckCircle, FiEdit2, FiHome, FiMapPin, FiPhone, FiPlus, FiTrash2, FiTruck } from "react-icons/fi";
import { AddressForm, AddressDraft, emptyAddress } from "@/components/address";
import { Button, Confirm, Modal } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { Address, useAction, useAuth } from "@/lib/ui/hooks";
import "./addresses.css";

const LIMIT = 10;
const iconFor = (label?: string) => (/home/i.test(label ?? "") ? FiHome : /work|office/i.test(label ?? "") ? FiBriefcase : FiMapPin);

export default function Addresses() {
  const { me, refresh } = useAuth();
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<{ id?: string; v: AddressDraft } | null>(null), [del, setDel] = useState<Address | null>(null);
  if (!me) return null;
  const toDraft = (a: Address): AddressDraft => ({ label: a.label ?? "", recipientName: a.recipientName, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", landmark: a.landmark ?? "", city: a.city, state: a.state, postalCode: a.postalCode, countryCode: a.countryCode });
  const clean = (v: AddressDraft) => ({ ...v, line2: v.line2 || undefined, landmark: v.landmark || undefined });
  const full = me.addresses.length >= LIMIT;
  const add = () => setEdit({ v: emptyAddress });
  // the default address is listed first
  const list = [...me.addresses].sort((a, b) => Number(b.id === me.defaultShippingAddressId) - Number(a.id === me.defaultShippingAddressId));

  return (
    <div className="adr">
      <header className="adr-head">
        <div>
          <h1>Addresses</h1>
          <p>{me.addresses.length} of {LIMIT} saved. Your default address is selected first at checkout.</p>
        </div>
        <Button onClick={add} disabled={full}><FiPlus aria-hidden="true" /> Add address</Button>
      </header>

      {!list.length ? (
        <div className="adr-empty">
          <i><FiMapPin aria-hidden="true" /></i>
          <b>No saved addresses yet</b>
          <p>Add one now to check out faster.</p>
          <Button onClick={add}><FiPlus aria-hidden="true" /> Add your first address</Button>
        </div>
      ) : (
        <ul className="adr-grid">
          {list.map((a) => {
            const isDefault = a.id === me.defaultShippingAddressId;
            const Icon = iconFor(a.label);
            return (
              <li key={a.id} className={`adr-card${isDefault ? " is-default" : ""}`}>
                <div className="adr-top">
                  <i aria-hidden="true"><Icon /></i>
                  <h2>{a.label || "Address"}</h2>
                  {isDefault && <span className="adr-tag"><FiCheckCircle aria-hidden="true" /> Default</span>}
                </div>
                <address>
                  <b>{a.recipientName}</b>
                  <span>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</span>
                  {a.landmark && <span>Landmark: {a.landmark}</span>}
                  <span>{a.city}, {a.state} – {a.postalCode}</span>
                  <span className="adr-phone"><FiPhone aria-hidden="true" /> {a.phone}</span>
                </address>
                {!isDefault && <button type="button" className="adr-default" disabled={busy} onClick={async () => { await run(() => api(`/api/me/addresses/${a.id}/default`, { method: "POST", body: { shipping: true, billing: true } }), "Default updated"); await refresh(); }}><FiTruck aria-hidden="true" /> Make default</button>}
                <div className="adr-actions">
                  <button type="button" onClick={() => setEdit({ id: a.id, v: toDraft(a) })} aria-label={`Edit ${a.label || "address"} for ${a.recipientName}`}><FiEdit2 aria-hidden="true" /> Edit</button>
                  <button type="button" className="danger" onClick={() => setDel(a)} aria-label={`Delete ${a.label || "address"} for ${a.recipientName}`}><FiTrash2 aria-hidden="true" /> Delete</button>
                </div>
              </li>
            );
          })}
          {!full && <li><button type="button" className="adr-new" onClick={add}><i><FiPlus aria-hidden="true" /></i>Add a new address</button></li>}
        </ul>
      )}

      <div className="adr-dialog">
        <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit address" : "New address"}>
          {edit && <div className="col"><AddressForm value={edit.v} onChange={(v) => setEdit({ ...edit, v })} />
            <Button busy={busy} onClick={async () => { const r = await run(() => edit.id ? api(`/api/me/addresses/${edit.id}`, { method: "PATCH", body: clean(edit.v) }) : api("/api/me/addresses", { method: "POST", body: clean(edit.v) }), "Address saved"); if (r !== undefined) { setEdit(null); await refresh(); } }}>Save address</Button></div>}
        </Modal>
        <Confirm open={!!del} onClose={() => setDel(null)} danger busy={busy} title="Delete address?" confirmLabel="Delete" onConfirm={async () => { if (del) { await run(() => api(`/api/me/addresses/${del.id}`, { method: "DELETE" }), "Address deleted"); setDel(null); await refresh(); } }}><p>{del?.recipientName}, {del?.line1}, {del?.city}</p></Confirm>
      </div>
    </div>
  );
}
