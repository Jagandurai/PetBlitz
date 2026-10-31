"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { FiHeart, FiShield, FiShoppingBag } from "react-icons/fi";
import { Alert, Spinner } from "@/components/ui";
import { api, errText } from "@/lib/ui/api";
import { useApi, useAuth, useToast } from "@/lib/ui/hooks";

declare global { interface Window { google?: { accounts: { id: { initialize(o: Record<string, unknown>): void; renderButton(el: HTMLElement, o: Record<string, unknown>): void } } } } }

function LoginInner() {
  const { me, refresh } = useAuth();
  const router = useRouter(), sp = useSearchParams();
  const next = sp.get("next")?.startsWith("/") && !sp.get("next")?.startsWith("//") ? sp.get("next")! : "/account"; // same-site paths only (no open redirect)
  const { data: s } = useApi<{ googleClientId: string | null }>("/api/settings/public");
  const btn = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  useEffect(() => { if (me) router.replace(next); }, [me, next, router]);
  useEffect(() => {
    if (!s?.googleClientId || !btn.current) return;
    const el = btn.current;
    const init = () => {
      window.google?.accounts.id.initialize({ client_id: s.googleClientId, callback: async (r: { credential: string }) => { try { await api("/api/auth/google", { method: "POST", body: { idToken: r.credential } }); await refresh(); toast("Signed in", "ok"); } catch (e) { toast(errText(e), "err"); } } });
      window.google?.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 320 });
    };
    if (window.google) { init(); return; }
    const sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = init; sc.onerror = () => toast("Could not load Google sign-in.", "err"); document.head.appendChild(sc);
  }, [s, refresh, toast]);
  return (
    <div className="lg" style={{ minHeight: "calc(100vh - 160px)", borderRadius: 24, overflow: "hidden" }}>
      <aside className="lg-hero">
        <img src="/logo.png" alt="PetBlitz" className="lg-logo" />
        <h2>Everything your pet needs, in one place.</h2>
        <p>Sign in to save your cart, track orders and use your wallet.</p>
        <ul><li><FiShoppingBag /> Faster checkout &amp; saved addresses</li><li><FiHeart /> Track orders and returns</li><li><FiShield /> Secure Google sign-in, no password stored</li></ul>
      </aside>
      <main className="lg-main">
        <div className="lg-card">
          <img src="/logo.png" alt="PetBlitz" className="lg-logo-m" />
          <h1>Welcome to PetBlitz</h1>
          <p className="lg-sub">Continue with your Google account</p>
          {s && !s.googleClientId && <Alert kind="warn">Google sign-in is not configured yet (GOOGLE_CLIENT_ID).</Alert>}
          <div ref={btn} className="lg-google" style={{ minHeight: 44 }} />
          <p className="lg-foot"><FiShield /> We only receive your name, e-mail and photo.</p>
        </div>
      </main>
    </div>
  );
}
export default function Login() { return <Suspense fallback={<Spinner />}><LoginInner /></Suspense>; }

