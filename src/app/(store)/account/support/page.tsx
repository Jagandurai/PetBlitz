"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Empty, ErrorBox, Modal, Pager, Select, Spinner, TextArea, TextField } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { dt } from "@/lib/ui/format";
import { useAction, useApi } from "@/lib/ui/hooks";

export default function Support() {
  const [page, setPage] = useState(1), [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useApi<{ items: { _id: string; ticketNumber: string; subject: string; status: string; lastMessageAt: string }[]; total: number; pageSize: number }>(`/api/me/tickets?page=${page}&pageSize=10`);
  const [f, setF] = useState({ subject: "", body: "", category: "general" });
  const { busy, run } = useAction();
  return (
    <>
      <div className="row between"><h1>Support</h1><Button onClick={() => setOpen(true)}>New request</Button></div>
      {loading ? <Spinner /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.items.length ? <Empty>No support requests yet.</Empty> : data.items.map((t) => <Link key={t._id} href={`/account/support/${t._id}`} className="card row between" style={{ color: "inherit" }}><div><strong>{t.subject}</strong><div className="small muted">{t.ticketNumber} · {dt(t.lastMessageAt)}</div></div><Badge status={t.status} /></Link>)}
      <Pager page={page} totalPages={Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 10)))} onPage={setPage} />
      <Modal open={open} onClose={() => setOpen(false)} title="New support request"><div className="col">
        <Select label="Topic" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={["general", "payment", "delivery", "return", "refund", "product", "pet", "other"].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))} />
        <TextField label="Subject" value={f.subject} onChange={(v) => setF({ ...f, subject: v })} maxLength={200} /><TextArea label="How can we help?" value={f.body} onChange={(v) => setF({ ...f, body: v })} maxLength={5000} />
        <Button busy={busy} disabled={f.subject.length < 3 || !f.body} onClick={async () => { if (await run(() => api("/api/me/tickets", { method: "POST", body: f }), "Request sent")) { setOpen(false); setF({ subject: "", body: "", category: "general" }); reload(); } }}>Send</Button></div></Modal>
    </>
  );
}
