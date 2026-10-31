"use client";
import { useState } from "react";
import { AddressForm, AddressDraft, emptyAddress } from "@/components/address";
import { Badge, Button, Confirm, Empty, Modal } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { Address, useAction, useAuth } from "@/lib/ui/hooks";

export default function Addresses() {
  const { me, refresh } = useAuth();
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<{ id?: string; v: AddressDraft } | null>(null), [del, setDel] = useState<Address | null>(null);
  if (!me) return null;
  const toDraft = (a: Address): AddressDraft => ({ label: a.label ?? "", recipientName: a.recipientName, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", landmark: a.landmark ?? "", city: a.city, state: a.state, postalCode: a.postalCode, countryCode: a.countryCode });
  const clean = (v: AddressDraft) => ({ ...v, line2: v.line2 || undefined, landmark: v.landmark || undefined });
  return (
    <>
      <div className="row between"><h1>Addresses</h1><Button onClick={() => setEdit({ v: emptyAddress })} disabled={me.addresses.length >= 10}>+ Add address</Button></div>
      {!me.addresses.length ? <Empty>No saved addresses yet.</Empty> : <div className="grid g2">{me.addresses.map((a) => (
        <div key={a.id} className="card col"><div className="row between"><strong>{a.label || "Address"}</strong><span className="row">{a.id === me.defaultShippingAddressId && <Badge status="info" label="Default shipping" />}</span></div>
          <div>{a.recipientName} · {a.phone}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.state} {a.postalCode}</div>
          <div className="row"><Button className="ghost sm" onClick={() => setEdit({ id: a.id, v: toDraft(a) })}>Edit</Button>{a.id !== me.defaultShippingAddressId && <Button className="ghost sm" onClick={async () => { await run(() => api(`/api/me/addresses/${a.id}/default`, { method: "POST", body: { shipping: true, billing: true } }), "Default updated"); await refresh(); }}>Make default</Button>}<Button className="ghost sm" onClick={() => setDel(a)}>Delete</Button></div></div>))}</div>}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit address" : "New address"}>
        {edit && <div className="col"><AddressForm value={edit.v} onChange={(v) => setEdit({ ...edit, v })} />
          <Button busy={busy} onClick={async () => { const r = await run(() => edit.id ? api(`/api/me/addresses/${edit.id}`, { method: "PATCH", body: clean(edit.v) }) : api("/api/me/addresses", { method: "POST", body: clean(edit.v) }), "Address saved"); if (r !== undefined) { setEdit(null); await refresh(); } }}>Save</Button></div>}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} danger busy={busy} title="Delete address?" confirmLabel="Delete" onConfirm={async () => { if (del) { await run(() => api(`/api/me/addresses/${del.id}`, { method: "DELETE" }), "Address deleted"); setDel(null); await refresh(); } }}><p>{del?.line1}, {del?.city}</p></Confirm>
    </>
  );
}
