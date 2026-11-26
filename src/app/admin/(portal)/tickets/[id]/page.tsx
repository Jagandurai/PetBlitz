"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, ErrorBox, Select, Spinner, TextArea } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { Can } from "@/lib/ui/admin";
import { dt } from "@/lib/ui/format";
import { useAction, useApi } from "@/lib/ui/hooks";
import { useSeen } from "@/lib/ui/unread";

interface T { _id: string; ticketNumber: string; subject: string; status: string; category: string; orderId?: string; customerId?: string; guest?: { name?: string; email?: string; phone?: string }; account?: { name?: string; email?: string; phone?: string } | null; thread: { senderType: string; body: string; createdAt: string }[] }

export default function AdminTicket() {
  const { id } = useParams<{ id: string }>();
  const { data: t, loading, error, reload } = useApi<T>(`/api/admin/tickets/${id}`);
  const [body, setBody] = useState("");
  const { busy, run } = useAction();
  useSeen(t?._id);
  if (loading && !t) return <Spinner />;
  if (error || !t) return <ErrorBox msg={error ?? "Not found"} retry={reload} />;
  // a contact-form message carries the registered e-mail it was sent with: replies go there
  const email = t.guest?.email ?? t.account?.email;
  const phone = t.guest ? t.guest.phone : t.account?.phone;
  return (
    <div className="set sd">
      <div className="top"><div><Link href="/admin/tickets">← Tickets</Link><h1>{t.subject}</h1><span className="muted small">{t.ticketNumber} · {t.category} · {email ?? "signed-in customer"}</span></div><Badge status={t.status} /></div>
      <div className="card"><h3>Sender</h3>
        <dl className="tk-who">
          <div><dt>{t.customerId ? "Registered e-mail" : "E-mail (sent without an account)"}</dt><dd>{email ?? "—"}</dd></div>
          <div><dt>Name</dt><dd>{t.guest?.name ?? t.account?.name ?? "—"}</dd></div>
          <div><dt>Phone</dt><dd>{phone || "—"}</dd></div>
          <div><dt>Customer ID</dt><dd className="mono">{t.customerId ? <Link href={`/admin/customers/${t.customerId}`}>{t.customerId}</Link> : "—"}</dd></div>
          <div><dt>Topic</dt><dd style={{ textTransform: "capitalize" }}>{t.category}</dd></div>
          <div><dt>Subject</dt><dd>{t.subject}</dd></div>
        </dl>
        {email && <p className="small muted">Your replies are e-mailed to {email}.</p>}
      </div>
      {t.orderId && <div><Link className="btn ghost sm" href={`/admin/orders/${t.orderId}`}>Related order →</Link></div>}
      <div className="tk-thread">{t.thread.map((m, i) => <div key={i} className={`tk-msg ${m.senderType === "admin" ? "tk-admin" : ""}`}><span className="pl-av">{m.senderType[0]!.toUpperCase()}</span><div className="tk-bub"><div className="tk-meta"><strong>{m.senderType === "admin" ? "Support team" : "Customer"}</strong><span>{dt(m.createdAt)}</span></div><div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div></div></div>)}</div>
      <Can perm="support.write"><form className="card col" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(`/api/admin/tickets/${id}/reply`, { method: "POST", body: { body } }), "Reply sent")) { setBody(""); reload(); } }}>
        <TextArea label="Reply" value={body} onChange={setBody} maxLength={5000} />
        <div className="row tk-actions"><Button busy={busy} disabled={!body.trim()}>Send reply</Button><Select label="" value={t.status} onChange={async (v) => { if (await run(() => api(`/api/admin/tickets/${id}/status`, { method: "PATCH", body: { status: v } }), "Status updated")) reload(); }} options={["open", "pending", "resolved", "closed"].map((v) => ({ value: v, label: `Status: ${v}` }))} /><Button type="button" className="ghost" onClick={async () => { if (await run(() => api(`/api/admin/tickets/${id}/assign`, { method: "POST" }), "Assigned to you")) reload(); }}>Assign to me</Button></div></form></Can>
    </div>
  );
}
