"use client";
import { useEffect, useState } from "react";
import { Button, Check, TextField } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { inr } from "@/lib/ui/format";
import { useAction, useAuth } from "@/lib/ui/hooks";

export default function Profile() {
  const { me, refresh } = useAuth();
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", newsletter: false });
  const { busy, run } = useAction();
  useEffect(() => { if (me) setF({ firstName: me.firstName ?? "", lastName: me.lastName ?? "", phone: me.phone ?? "", newsletter: !!me.marketingConsent?.granted }); }, [me]);
  if (!me) return null;
  return (
    <>
      <h1>My profile</h1>
      <div className="grid g3"><div className="card"><div className="muted small">Wallet balance</div><b style={{ fontSize: "1.5rem" }}>{inr(me.wallet.balance)}</b></div><div className="card"><div className="muted small">E-mail</div>{me.email}</div><div className="card"><div className="muted small">Saved addresses</div><b>{me.addresses.length}</b></div></div>
      <form className="card col" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api("/api/me", { method: "PATCH", body: { firstName: f.firstName || undefined, lastName: f.lastName || undefined, ...(f.phone ? { phone: f.phone } : {}), marketingConsent: f.newsletter } }), "Profile saved")) await refresh(); }}>
        <div className="grid g2"><TextField label="First name" value={f.firstName} onChange={(v) => setF({ ...f, firstName: v })} /><TextField label="Last name" value={f.lastName} onChange={(v) => setF({ ...f, lastName: v })} /></div>
        <TextField label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} hint="Used by the courier" />
        <Check label="Send me offers and updates" checked={f.newsletter} onChange={(v) => setF({ ...f, newsletter: v })} />
        <div><Button busy={busy}>Save changes</Button></div>
      </form>
    </>
  );
}
