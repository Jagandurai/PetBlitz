"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LuArrowRight, LuCircleCheck, LuCircleHelp, LuClock, LuLock, LuMail, LuPackageSearch, LuRotateCcw, LuSend } from "react-icons/lu";
import { homeFonts } from "@/components/home/fonts";
import { PageHero } from "@/components/page-parts";
import { Button, Select, TextArea, TextField } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/content/pages";
import { api } from "@/lib/ui/api";
import { useAction, useAuth } from "@/lib/ui/hooks";
import "./contact.css";

// no e-mail here: it is never sent, the server takes it from the signed-in account
const EMPTY = { name: "", phone: "", subject: "", body: "", category: "general", website: "" };
const TOPICS = ["general", "payment", "delivery", "return", "refund", "product", "other"].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }));
const SHORTCUTS = [
  { href: "/track-order", icon: LuPackageSearch, title: "Track an order", text: "See where your order is" },
  { href: "/account/returns", icon: LuRotateCcw, title: "Returns", text: "Check your return requests" },
  { href: "/faq", icon: LuCircleHelp, title: "Help & FAQ", text: "Find quick answers" },
];

export default function ContactForm() {
  const { me, loading } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [done, setDone] = useState<string | null>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const filled = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!me) { window.location.replace("/login?next=/contact"); return; } // signed out while on the page
    if (filled.current) return;
    filled.current = true; // fill once; the customer can still change name and phone
    const name = me.displayName ?? [me.firstName, me.lastName].filter(Boolean).join(" ");
    setF((x) => ({ ...x, name: x.name || name, phone: x.phone || (me.phone ?? "") }));
  }, [me, loading]);

  return (
    <div className={`pg ${homeFonts}`}>
      <PageHero eyebrow="PetBlitz help centre" title="Contact Us" intro="Questions about a product or an order? Send us a message and we'll help." />

      {done ? (
        <div className="ct-done" role="status">
          <LuCircleCheck aria-hidden="true" />
          <h2>Thank you!</h2>
          <p>Your request <strong>{done}</strong> has been received. We reply to <strong>{me?.email}</strong> within one business day.</p>
          <div className="ct-actions">
            <Link href="/products" className="pg-btn">Continue shopping <LuArrowRight aria-hidden="true" /></Link>
            <Link href="/" className="pg-btn light">Back to home</Link>
          </div>
        </div>
      ) : (
        <div className="ct-grid">
          <aside className="ct-side" aria-labelledby="ct-help">
            <h2 id="ct-help">We&apos;re here to help</h2>
            <p>Write to us directly, or use a shortcut below.</p>
            <ul className="ct-links">
              <li><a href={`mailto:${SUPPORT_EMAIL}`}><i><LuMail aria-hidden="true" /></i><span><b>Email us</b>{SUPPORT_EMAIL}</span></a></li>
              {SHORTCUTS.map(({ href, icon: Icon, title, text }) => <li key={href}><Link href={href}><i><Icon aria-hidden="true" /></i><span><b>{title}</b>{text}</span></Link></li>)}
            </ul>
            <p className="ct-note"><LuClock aria-hidden="true" /> We reply by e-mail within one business day.</p>
          </aside>

          <section className="ct-card" aria-labelledby="ct-form-title">
            <h2 id="ct-form-title">Send us a message</h2>
            <p className="ct-lead">Tell us what you need. All fields are required unless marked optional.</p>
            <form className="ct-form" onSubmit={async (e) => { e.preventDefault(); if (busy) return; const r = await run(() => api<{ ticketNumber?: string }>("/api/contact", { method: "POST", body: { ...f, phone: f.phone || undefined } })); if (r) setDone(r.ticketNumber ?? "received"); }}>
              <div className="ct-row">
                <TextField label="Your name" value={f.name} onChange={set("name")} required maxLength={120} autoComplete="name" />
                <div className="ct-email">
                  <label className="f" htmlFor="ct-email">E-mail</label>
                  <span className="ct-locked">
                    <input id="ct-email" type="email" value={me?.email ?? ""} placeholder={loading ? "Loading your account…" : ""} readOnly aria-readonly="true" aria-describedby="ct-email-help" />
                    <LuLock aria-hidden="true" />
                  </span>
                  <small id="ct-email-help">This email is linked to your PetBlitz account.</small>
                </div>
              </div>
              <div className="ct-row"><TextField label="Phone (optional)" value={f.phone} onChange={set("phone")} maxLength={20} autoComplete="tel" /><Select label="Topic" value={f.category} onChange={set("category")} options={TOPICS} /></div>
              <TextField label="Subject" value={f.subject} onChange={set("subject")} required maxLength={200} />
              <TextArea label="Message" value={f.body} onChange={set("body")} maxLength={5000} hint="At least 10 characters" />
              {/* spam trap: hidden from people, left empty by them */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website")(e.target.value)} /></label></div>
              <Button busy={busy} disabled={!me}><LuSend aria-hidden="true" /> Send message</Button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
