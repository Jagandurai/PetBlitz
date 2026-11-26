"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { FiHeart, FiPackage, FiRefreshCw, FiShield } from "react-icons/fi";
import { Skel } from "@/components/store/ui";
import { PublicSettings } from "@/components/store/types";
import { api, errText } from "@/lib/ui/api";
import { useApi, useAuth } from "@/lib/ui/hooks";

declare global { interface Window { google?: { accounts: { id: { initialize(o: Record<string, unknown>): void; renderButton(el: HTMLElement, o: Record<string, unknown>): void } } } } }

function LoginInner() {
  const { me, refresh } = useAuth();
  const router = useRouter(), sp = useSearchParams();
  const raw = sp.get("next") ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account"; // same-site paths only: no open redirect
  const { data: s } = useApi<PublicSettings>("/api/settings/public");
  const btn = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (me) router.replace(next); }, [me, next, router]);
  useEffect(() => {
    if (!s?.googleClientId || !btn.current) return;
    const el = btn.current;
    const init = () => {
      window.google?.accounts.id.initialize({ client_id: s.googleClientId, callback: async (r: { credential: string }) => { try { await api("/api/auth/google", { method: "POST", body: { idToken: r.credential } }); await refresh(); } catch (e) { setErr(errText(e)); } } });
      window.google?.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 300 });
    };
    if (window.google) { init(); return; }
    const sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = init; sc.onerror = () => setErr("Could not load Google sign-in. Check your connection and try again."); document.head.appendChild(sc);
  }, [s, refresh]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 22, maxWidth: 900, margin: "20px auto" }}>
      <div className="sf-box" style={{ background: "linear-gradient(150deg,#0b5a54,#14b8a6)", color: "#fff", border: 0 }}>
        <h2 style={{ fontSize: "1.5rem" }}>Everything for your pet, one account</h2>
        {[[FiPackage, "Track every order, from packing to delivery"], [FiRefreshCw, "Instant refunds to your PetBlitz wallet"], [FiHeart, "Save your cart and addresses on any device"], [FiShield, "Secure — no password to remember or leak"]].map(([I, t]) => { const Icon = I as typeof FiHeart; return <p key={t as string} style={{ display: "flex", gap: 10, alignItems: "center" }}><Icon size={20} />{t as string}</p>; })}
      </div>
      <div className="sf-box" style={{ textAlign: "center", alignSelf: "center" }}>
        <h1 style={{ marginTop: 0 }}>Sign in or create account</h1>
        <p style={{ color: "var(--mu)" }}>Continue with Google — new customers are registered automatically.</p>
        {err && <div className="sf-fs" style={{ background: "#fdecec", color: "var(--deal)" }}>{err}</div>}
        {s && !s.googleClientId && <div className="sf-fs" style={{ background: "#fef3e2", color: "#b54708" }}>Google sign-in isn&apos;t configured yet.</div>}
        <div ref={btn} style={{ display: "flex", justifyContent: "center", minHeight: 44, margin: "14px 0" }} />
        <p className="small" style={{ color: "var(--mu)" }}>By continuing you agree to our <Link href="/terms" style={{ textDecoration: "underline" }}>Terms</Link> and <Link href="/privacy-policy" style={{ textDecoration: "underline" }}>Privacy policy</Link>.</p>
      </div>
    </div>
  );
}
export default function Login() { return <Suspense fallback={<Skel h={300} />}><LoginInner /></Suspense>; }
