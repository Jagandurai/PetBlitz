"use client";
/* eslint-disable @next/next/no-img-element */
import QRCode from "qrcode";
import { useState } from "react";
import { FiKey, FiShield } from "react-icons/fi";
import { Alert, Button, TextField } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { useAdmin } from "@/lib/ui/admin";
import { useAction } from "@/lib/ui/hooks";

export default function Account() {
  const { me, reload } = useAdmin();
  const { busy, run } = useAction();
  const [pw, setPw] = useState({ current: "", next: "" });
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null), [code, setCode] = useState(""), [recovery, setRecovery] = useState<string[] | null>(null);
  const [dis, setDis] = useState({ password: "", code: "" });
  if (!me) return null;
  const session = me.via === "session";
  return (
    <div className="set">
      <div className="top"><div><h1>My account &amp; security</h1><p className="muted small" style={{ margin: 0 }}>Manage your sign-in details, password and two-factor authentication.</p></div></div>
      <div className="set-card acct-id mt"><span className="acct-av">{(me.email ?? "K")[0].toUpperCase()}</span><div className="grow"><strong>{me.email ?? "API key"}</strong><div className="muted small">Signed in via {me.via}</div></div><span className="acct-role">{me.role}</span></div>
      {!session && <div className="mt"><Alert kind="warn">You are using the shared API key. Create a personal account (Admins page or <code>npm run admin:create</code>) and then switch off the key with ADMIN_API_KEY_ENABLED=false.</Alert></div>}
      {me.mfaSetupRequired && <Alert kind="warn">Your organisation requires multi-factor authentication. Set it up below to continue.</Alert>}
      {session && <div className="acct-grid mt">
        <div className="set-card"><div className="set-h"><span className="set-ic"><FiKey /></span><div><h2>Change password</h2><p>Use a strong, unique password.</p></div></div>
          <TextField label="Current password" type="password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} autoComplete="current-password" /><TextField label="New password" type="password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} hint="Min 12 characters. Other devices are signed out." autoComplete="new-password" />
          <div><Button busy={busy} disabled={!pw.current || pw.next.length < 12} onClick={async () => { if (await run(() => api("/api/admin/auth/password", { method: "POST", body: pw }), "Password changed")) setPw({ current: "", next: "" }); }}>Change password</Button></div></div>
        <div className="set-card"><div className="set-h"><span className="set-ic"><FiShield /></span><div><h2>Two-factor authentication</h2><p>Authenticator app (TOTP) at sign-in.</p></div></div>
          {recovery ? <><Alert kind="ok">MFA is on. <strong>Save these one-time recovery codes now</strong> — they are shown only once.</Alert><pre className="card mono">{recovery.join("\n")}</pre><Button className="ghost" onClick={() => { setRecovery(null); reload(); }}>I have saved them</Button></>
            : setup ? <><p>Scan with Google Authenticator, Authy or 1Password, then enter the 6-digit code.</p>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={setup.qr} alt="MFA QR code" width={200} height={200} /><p className="small muted">Can&apos;t scan? Key: <span className="mono">{setup.secret}</span></p><TextField label="6-digit code" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /><Button busy={busy} disabled={code.length !== 6} onClick={async () => { const r = await run(() => api<{ recoveryCodes: string[] }>("/api/admin/auth/mfa/enable", { method: "POST", body: { code } })); if (r) { setRecovery(r.recoveryCodes); setSetup(null); setCode(""); } }}>Enable MFA</Button></>
            : <><p>Adds a one-time code at sign-in. Strongly recommended for every admin.</p><div><Button busy={busy} onClick={async () => { const r = await run(() => api<{ secret: string; otpauthUrl: string }>("/api/admin/auth/mfa/setup", { method: "POST" })); if (r) setSetup({ secret: r.secret, qr: await QRCode.toDataURL(r.otpauthUrl, { width: 200, margin: 1 }) }); }}>Set up MFA</Button></div>
              <details><summary>Turn MFA off</summary><div className="col mt"><TextField label="Password" type="password" value={dis.password} onChange={(v) => setDis({ ...dis, password: v })} /><TextField label="Current code" value={dis.code} onChange={(v) => setDis({ ...dis, code: v })} inputMode="numeric" /><div><Button className="danger" busy={busy} onClick={async () => { if (await run(() => api("/api/admin/auth/mfa/disable", { method: "POST", body: dis }), "MFA disabled")) { setDis({ password: "", code: "" }); reload(); } }}>Disable MFA</Button></div></div></details></>}
        </div></div>}
    </div>
  );
}
