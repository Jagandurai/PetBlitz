"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { FiArrowLeft, FiHeadphones, FiLock, FiSend } from "react-icons/fi";
import { Badge, Button, ErrorBox, Spinner, TextArea } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { dt } from "@/lib/ui/format";
import { useAction, useApi } from "@/lib/ui/hooks";
import { useSeen } from "@/lib/ui/unread";
import "./ticket.css";

interface Ticket { _id: string; ticketNumber: string; subject: string; status: string; messageCount: number; thread: { senderType: string; body: string; createdAt: string }[] }

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { data: t, loading, error, reload } = useApi<Ticket>(`/api/me/tickets/${id}`);
  const [body, setBody] = useState("");
  const { busy, run } = useAction();
  useSeen(t?._id);
  if (loading && !t) return <Spinner />;
  if (error || !t) return <ErrorBox msg={error ?? "Not found"} retry={reload} />;
  return (
    <div className="tkc">
      <header className="tkc-head">
        <Link href="/account/support" className="tkc-back"><FiArrowLeft aria-hidden="true" /> All requests</Link>
        <h1>{t.subject}</h1>
        <div className="tkc-meta"><span>{t.ticketNumber}</span><Badge status={t.status} /></div>
      </header>

      <section className="tkc-card" aria-label="Conversation">
        <ol className="tkc-thread">
          {t.thread.map((m, i) => {
            const staff = m.senderType === "admin";
            return (
              <li key={i} className={staff ? "staff" : "mine"}>
                {staff && <i aria-hidden="true"><FiHeadphones /></i>}
                <div className="tkc-bubble">
                  <p>{m.body}</p>
                  <span>{staff ? "PetBlitz support" : "You"} · {dt(m.createdAt)}</span>
                </div>
              </li>
            );
          })}
        </ol>
        {t.status !== "closed" ? (
          <form className="tkc-reply" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(`/api/me/tickets/${id}/reply`, { method: "POST", body: { body } }), "Reply sent")) { setBody(""); reload(); } }}>
            <TextArea label="Reply" value={body} onChange={setBody} maxLength={5000} rows={2} />
            <Button busy={busy} disabled={!body.trim()}><FiSend aria-hidden="true" /> Send reply</Button>
          </form>
        ) : (
          <p className="tkc-closed"><FiLock aria-hidden="true" /><span>This request is closed. Need more help? <Link href="/account/support">Open a new request</Link>.</span></p>
        )}
      </section>
    </div>
  );
}
