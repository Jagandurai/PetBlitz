"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FiCheckCircle, FiEye, FiEyeOff, FiLock, FiMail, FiShield } from "react-icons/fi";
import { Alert, Button, TextField } from "@/components/ui";
import { ApiError, api, errText } from "@/lib/ui/api";
import { useApi, useToast } from "@/lib/ui/hooks";

declare global { interface Window { google?: { accounts: { id: { initialize(o: Record<string, unknown>): void; renderButton(el: HTMLElement, o: Record<string, unknown>): void } } } } }

export default function AdminLogin() {
  const router = useRouter(), { toast } = useToast();
  const [f, setF] = useState({ email: "", password: "", totp: "", recovery: "" });
  const [needMfa, setNeedMfa] = useState(false), [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false), [caps, setCaps] = useState(false), [touched, setTouched] = useState({ email: false, password: false });
  const email = f.email.trim();
  const emailErr = (touched.email && !email ? "E-mail is required" : touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "Enter a valid e-mail address" : "");
  const pwErr = touched.password && !f.password ? "Password is required" : "";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !f.password) return;
    setBusy(true);
    try {
      const r = await api<{ mfaSetupRequired: boolean }>("/api/admin/auth/login", { method: "POST", body: { email, password: f.password, ...(f.totp ? { totp: f.totp } : {}), ...(f.recovery ? { recoveryCode: f.recovery } : {}) } });
      toast("Signed in", "ok"); router.replace(r.mfaSetupRequired ? "/admin/account" : "/admin");
    } catch (e2) {
      if (e2 instanceof ApiError && e2.code === "MFA_REQUIRED") setNeedMfa(true); else toast(errText(e2), "err");
    } finally { setBusy(false); }
  };
  const { data: s } = useApi<{ googleClientId: string | null }>("/api/settings/public");
  const btn = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!s?.googleClientId || !btn.current) return;
    const el = btn.current;
    const init = () => {
      window.google?.accounts.id.initialize({ client_id: s.googleClientId, callback: async (r: { credential: string }) => { try { await api("/api/admin/auth/google", { method: "POST", body: { idToken: r.credential } }); toast("Signed in", "ok"); router.replace("/admin"); } catch (e) { toast(errText(e), "err"); } } });
      window.google?.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "pill", text: "signin_with", width: 320 });
    };
    if (window.google) { init(); return; }
    const sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = init; sc.onerror = () => toast("Could not load Google sign-in.", "err"); document.head.appendChild(sc);
  }, [s, router, toast]);
  return (
    <div className="lg">
      <aside className="lg-hero">
        <img src="/logo.png" alt="PetBlitz" className="lg-logo" />
        <h2>Run your store with confidence.</h2>
        <p>Manage pets, products, orders and customers from one secure place.</p>
        <ul><li><FiShield /> Role-based access &amp; audit logging</li><li><FiLock /> Two-factor authentication supported</li><li><FiCheckCircle /> Every sign-in is monitored</li></ul>
      </aside>
      <main className="lg-main">
        <form className="lg-card" onSubmit={submit} noValidate>
          <img src="/logo.png" alt="PetBlitz" className="lg-logo-m" />
          <h1>Welcome back</h1>
          <p className="lg-sub">Sign in to the PetBlitz admin portal</p>
          <div ref={btn} className="lg-google" />
          {s?.googleClientId && <div className="lg-or"><span>or sign in with e-mail</span></div>}
          <label className={`lg-f ${emailErr ? "bad" : ""}`}>
            <span>E-mail address</span>
            <div className="lg-in"><FiMail /><input type="email" value={f.email} placeholder="you@company.com" autoComplete="username" autoFocus onChange={(e) => setF({ ...f, email: e.target.value })} onBlur={() => setTouched({ ...touched, email: true })} aria-invalid={!!emailErr} /></div>
            {emailErr && <em>{emailErr}</em>}
          </label>
          <label className={`lg-f ${pwErr ? "bad" : ""}`}>
            <span>Password</span>
            <div className="lg-in"><FiLock /><input type={show ? "text" : "password"} value={f.password} placeholder="Enter your password" autoComplete="current-password" onChange={(e) => setF({ ...f, password: e.target.value })} onBlur={() => setTouched({ ...touched, password: true })} onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))} aria-invalid={!!pwErr} />
              <button type="button" className="lg-eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide password" : "Show password"}>{show ? <FiEyeOff /> : <FiEye />}</button></div>
            {pwErr ? <em>{pwErr}</em> : caps && <em className="warn">Caps Lock is on</em>}
          </label>
          {needMfa && <div className="lg-mfa"><Alert kind="info">Enter the 6-digit code from your authenticator app.</Alert><TextField label="Authenticator code" value={f.totp} onChange={(v) => setF({ ...f, totp: v.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" autoComplete="one-time-code" /><TextField label="…or a recovery code" value={f.recovery} onChange={(v) => setF({ ...f, recovery: v })} hint="Each recovery code works once" /></div>}
          <Button busy={busy}>Sign in</Button>
          <p className="lg-foot"><FiShield /> Authorised staff only. Activity is logged.</p>
        </form>
      </main>
    </div>
  );
}

