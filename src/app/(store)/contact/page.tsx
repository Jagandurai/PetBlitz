"use client";
import { useState } from "react";
import { Alert, Button, Select, TextArea, TextField } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { useAction } from "@/lib/ui/hooks";

export default function Contact() {
  const [f, setF] = useState({ name: "", email: "", phone: "", subject: "", body: "", category: "general", website: "" });
  const [done, setDone] = useState<string | null>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  if (done) return <Alert kind="ok">Thanks! Your request <strong>{done}</strong> has been received. We reply by e-mail within one business day.</Alert>;
  return (
    <form className="card col" style={{ maxWidth: 640, margin: "0 auto" }} onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api<{ ticketNumber?: string }>("/api/contact", { method: "POST", body: { ...f, phone: f.phone || undefined } })); if (r) setDone(r.ticketNumber ?? "received"); }}>
      <h1>Contact us</h1>
      <div className="grid g2"><TextField label="Your name" value={f.name} onChange={set("name")} required /><TextField label="E-mail" type="email" value={f.email} onChange={set("email")} required /></div>
      <div className="grid g2"><TextField label="Phone (optional)" value={f.phone} onChange={set("phone")} /><Select label="Topic" value={f.category} onChange={set("category")} options={["general", "payment", "delivery", "return", "refund", "product", "pet", "other"].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))} /></div>
      <TextField label="Subject" value={f.subject} onChange={set("subject")} required maxLength={200} />
      <TextArea label="Message" value={f.body} onChange={set("body")} maxLength={5000} hint="At least 10 characters" />
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website")(e.target.value)} /></label></div>
      <Button busy={busy}>Send message</Button>
    </form>
  );
}
