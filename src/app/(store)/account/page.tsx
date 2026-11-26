"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FaPaw } from "react-icons/fa6";
import { LuArrowRight, LuCheck, LuCircleHelp, LuLock, LuMail, LuMapPin, LuPackage, LuShoppingBag, LuTruck, LuUserRound, LuWallet } from "react-icons/lu";
import { Button, TextField } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { inr } from "@/lib/ui/format";
import { useAction, useApi, useAuth } from "@/lib/ui/hooks";

const SHORTCUTS = [
  { href: "/products", icon: LuShoppingBag, title: "Shop accessories", text: "Find something your pet will love" },
  { href: "/track-order", icon: LuTruck, title: "Track an order", text: "See where your parcel is" },
  { href: "/account/support", icon: LuCircleHelp, title: "Get support", text: "Ask us a question" },
];

export default function Profile() {
  const { me, refresh } = useAuth();
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", newsletter: false });
  const { busy, run } = useAction();
  const orders = useApi<{ total: number }>(me ? "/api/me/orders?page=1&pageSize=1" : null);
  useEffect(() => { if (me) setF({ firstName: me.firstName ?? "", lastName: me.lastName ?? "", phone: me.phone ?? "", newsletter: !!me.marketingConsent?.granted }); }, [me]);
  if (!me) return null;

  const changed = f.firstName !== (me.firstName ?? "") || f.lastName !== (me.lastName ?? "") || f.phone !== (me.phone ?? "") || f.newsletter !== !!me.marketingConsent?.granted;
  const reset = () => setF({ firstName: me.firstName ?? "", lastName: me.lastName ?? "", phone: me.phone ?? "", newsletter: !!me.marketingConsent?.granted });
  const steps = [
    { done: !!me.firstName, label: "First name", href: "#ac-details" },
    { done: !!me.lastName, label: "Last name", href: "#ac-details" },
    { done: !!me.phone, label: "Phone number", href: "#ac-details" },
    { done: me.addresses.length > 0, label: "Delivery address", href: "/account/addresses" },
  ];
  const percent = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
  const stats = [
    { href: "/account/wallet", icon: LuWallet, label: "Wallet balance", value: inr(me.wallet.balance), more: "Open wallet", tone: "green" },
    { href: "/account/orders", icon: LuPackage, label: "Orders", value: orders.data?.total ?? "—", more: "View orders", tone: "orange" },
    { href: "/account/addresses", icon: LuMapPin, label: "Saved addresses", value: me.addresses.length, more: "Manage addresses", tone: "sage" },
  ];

  return (
    <>
      <header className="ac-hero">
        <svg className="ac-wave" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 92C120 20 240 30 350 62s190 38 300-4 230-52 350-22v84H0Z" fill="#CDE7DA" /><path d="M0 108c150-40 270-12 420 2s260-30 380-34 150 12 200 22v22H0Z" fill="#B5DCCB" /></svg>
        <FaPaw className="ac-deco one" aria-hidden="true" />
        <FaPaw className="ac-deco two" aria-hidden="true" />
        <div>
          <p className="ac-eyebrow"><FaPaw aria-hidden="true" /> My profile</p>
          <h1>Hello, {me.firstName || me.displayName || "pet parent"}!</h1>
          <p>Manage your details, orders and deliveries in one place.</p>
        </div>
        <Image src="/images/home/account-kitten-green.webp" alt="" width={1200} height={541} sizes="(max-width: 640px) 94vw, 480px" priority />
      </header>

      <ul className="ac-stats">
        {stats.map(({ href, icon: Icon, label, value, more, tone }) => (
          <li key={href}>
            <Link href={href} className={tone}>
              <i><Icon aria-hidden="true" /></i>
              <span>{label}</span>
              <b>{value}</b>
              <em>{more} <LuArrowRight aria-hidden="true" /></em>
            </Link>
          </li>
        ))}
      </ul>

      <section className="ac-progress" aria-labelledby="ac-progress-title">
        <div className="ac-progress-top"><h2 id="ac-progress-title">{percent === 100 ? "Your profile is complete" : "Complete your profile"}</h2><strong>{percent}%</strong></div>
        <div className="ac-bar" role="progressbar" aria-label="Profile completion" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div>
        <ul>{steps.map((s) => <li key={s.label} className={s.done ? "done" : ""}>{s.done ? <span><LuCheck aria-hidden="true" /> {s.label}</span> : <Link href={s.href}>+ Add {s.label.toLowerCase()}</Link>}</li>)}</ul>
      </section>

      <form id="ac-details" className="ac-panel" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api("/api/me", { method: "PATCH", body: { firstName: f.firstName || undefined, lastName: f.lastName || undefined, ...(f.phone ? { phone: f.phone } : {}), marketingConsent: f.newsletter } }), "Profile saved")) await refresh(); }}>
        <div className="ac-panel-head"><i><LuUserRound aria-hidden="true" /></i><div><h2>Personal details</h2><p>These help us reach you about your orders.</p></div></div>
        <div className="ac-email"><LuMail aria-hidden="true" /><div><span>E-mail (from your Google sign-in)</span><b>{me.email}</b></div><LuLock aria-label="Cannot be changed here" /></div>
        <div className="ac-row">
          <TextField label="First name" value={f.firstName} onChange={(v) => setF({ ...f, firstName: v })} autoComplete="given-name" />
          <TextField label="Last name" value={f.lastName} onChange={(v) => setF({ ...f, lastName: v })} autoComplete="family-name" />
        </div>
        <TextField label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} hint="Used by the courier" autoComplete="tel" />
        <label className="ac-switch">
          <span><b>Offers and updates</b><small>Send me offers and updates</small></span>
          <input type="checkbox" role="switch" checked={f.newsletter} onChange={(e) => setF({ ...f, newsletter: e.target.checked })} />
          <i aria-hidden="true" />
        </label>
        <div className="ac-actions">
          <Button busy={busy} disabled={!changed}>Save changes</Button>
          {changed && <button type="button" className="ac-reset" onClick={reset}>Discard</button>}
          <span aria-live="polite">{changed ? "You have unsaved changes" : "Everything is saved"}</span>
        </div>
      </form>

      <ul className="ac-shortcuts">
        {SHORTCUTS.map(({ href, icon: Icon, title, text }) => <li key={href}><Link href={href}><i><Icon aria-hidden="true" /></i><span><b>{title}</b>{text}</span><LuArrowRight className="go" aria-hidden="true" /></Link></li>)}
      </ul>
    </>
  );
}
