"use client";
/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { FiAlertCircle, FiHeart, FiLock, FiPackage, FiRefreshCw, FiShield } from "react-icons/fi";
import { FaPaw } from "react-icons/fa6";
import { homeFonts } from "@/components/home/fonts";
import { Skel } from "@/components/store/ui";
import { PublicSettings } from "@/components/store/types";
import { safeNext } from "@/lib/safe-redirect";
import { api, errText } from "@/lib/ui/api";
import { useApi, useAuth } from "@/lib/ui/hooks";
import "./login.css";

declare global { interface Window { google?: { accounts: { id: { initialize(o: Record<string, unknown>): void; renderButton(el: HTMLElement, o: Record<string, unknown>): void } } } } }

const BENEFITS = [
  { icon: FiPackage, title: "Track every order", text: "From packing to delivery" },
  { icon: FiRefreshCw, title: "Instant wallet refunds", text: "Back to your PetBlitz wallet" },
  { icon: FiHeart, title: "Saved for you", text: "Your cart and addresses on any device" },
  { icon: FiShield, title: "No new password", text: "Nothing extra to remember or leak" },
];

function LoginInner() {
  const { me, refresh } = useAuth();
  const sp = useSearchParams();
  const next = safeNext(sp.get("next")); // same-site paths only: no open redirect, no loop back to this page
  const forContact = next === "/contact" || next.startsWith("/contact?");
  const { data: s } = useApi<PublicSettings>("/api/settings/public");
  const btn = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  // a full load, so pages that check the session on the server never reuse what they showed while signed out
  useEffect(() => { if (me) window.location.replace(next); }, [me, next]);
  useEffect(() => {
    if (!s?.googleClientId || !btn.current) return;
    const el = btn.current;
    const init = () => {
      window.google?.accounts.id.initialize({ client_id: s.googleClientId, callback: async (r: { credential: string }) => { try { await api("/api/auth/google", { method: "POST", body: { idToken: r.credential } }); await refresh(); } catch (e) { setErr(errText(e)); } } });
      // Google's button has a fixed pixel width, so fit it to narrow screens
      window.google?.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: Math.max(200, Math.min(320, el.clientWidth)) });
    };
    if (window.google) { init(); return; }
    const sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = init; sc.onerror = () => setErr("Could not load Google sign-in. Check your connection and try again."); document.head.appendChild(sc);
  }, [s, refresh]);
  return (
    <div className={`lgn ${homeFonts}`}>
      <section className="lgn-form" aria-labelledby="lgn-title">
        <img className="lgn-logo" src="/logo.webp" alt="PetBlitz" width={1166} height={768} />
        <p className="lgn-hello"><FaPaw aria-hidden="true" /> Welcome, pet parent</p>
        <h1 id="lgn-title">Sign in or create your account</h1>
        <p className="lgn-sub">Continue with Google. New customers are registered automatically.</p>
        {forContact && <div className="lgn-alert info" role="status"><FiLock aria-hidden="true" />Please log in to your PetBlitz account to contact our support team.</div>}
        {err && <div className="lgn-alert error" role="alert"><FiAlertCircle aria-hidden="true" />{err}</div>}
        {s && !s.googleClientId && <div className="lgn-alert warn" role="status"><FiAlertCircle aria-hidden="true" />Google sign-in isn&apos;t configured yet.</div>}
        <div className="lgn-google">
          {/* Google draws its button into this box; the placeholder shows until it does */}
          <div ref={btn} className="lgn-gbtn" />
          {(!s || s.googleClientId) && !err && <span className="lgn-wait" aria-hidden="true">Loading Google sign-in…</span>}
        </div>
        <p className="lgn-safe"><FiLock aria-hidden="true" /> Sign-in is handled by Google. We never see your Google password.</p>
        <p className="lgn-terms">By continuing you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy-policy">Privacy policy</Link>.</p>
        <Link href="/products" className="lgn-browse">Just looking? Browse accessories →</Link>
      </section>

      <aside className="lgn-side" aria-labelledby="lgn-why">
        <FaPaw className="lgn-paw one" aria-hidden="true" />
        <FaPaw className="lgn-paw two" aria-hidden="true" />
        <div className="lgn-copy">
          <h2 id="lgn-why">Everything for your pet, one account</h2>
          <ul>
            {BENEFITS.map(({ icon: Icon, title, text }) => <li key={title}><i><Icon aria-hidden="true" /></i><span><b>{title}</b>{text}</span></li>)}
          </ul>
        </div>
        <Image className="lgn-pets" src="/images/home/about-pet-trio.webp" alt="A tabby kitten and two puppies peeking up" width={1400} height={524} sizes="(max-width: 860px) 90vw, 520px" priority />
      </aside>
    </div>
  );
}
export default function Login() { return <Suspense fallback={<Skel h={300} />}><LoginInner /></Suspense>; }
