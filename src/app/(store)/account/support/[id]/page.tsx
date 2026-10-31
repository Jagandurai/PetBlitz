"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, ErrorBox, Spinner, TextArea } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { dt } from "@/lib/ui/format";
import { useAction, useApi } from "@/lib/ui/hooks";

interface Ticket { _id: string; ticketNumber: string; subject: string; status: string; messageCount: number; thread: { senderType: string; body: string; createdAt: string }[] }

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { data: t, loading, error, reload } = useApi<Ticket>(`/api/me/tickets/${id}`);
  const [body, setBody] = useState("");
  const { busy, run } = useAction();
  if (loading && !t) return <Spinner />;
  if (error || !t) return <ErrorBox msg={error ?? "Not found"} retry={reload} />;
  return (
    <>
      <div className="row between"><h1>{t.subject}</h1><Badge status={t.status} /></div><p className="muted small">{t.ticketNumber}</p>
      {t.thread.map((m, i) => <div key={i} className="card" style={{ marginLeft: m.senderType === "admin" ? 0 : 40, marginRight: m.senderType === "admin" ? 40 : 0, background: m.senderType === "admin" ? "var(--brand-l)" : "#fff" }}><div className="small muted">{m.senderType === "admin" ? "PetBlitz support" : "You"} · {dt(m.createdAt)}</div><div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div></div>)}
      {t.status !== "closed" && <form className="card col" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(`/api/me/tickets/${id}/reply`, { method: "POST", body: { body } }), "Reply sent")) { setBody(""); reload(); } }}><TextArea label="Reply" value={body} onChange={setBody} maxLength={5000} /><div><Button busy={busy} disabled={!body.trim()}>Send reply</Button></div></form>}
    </>
  );
}
