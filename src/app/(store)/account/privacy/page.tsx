"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Confirm, TextField } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { useAction, useAuth } from "@/lib/ui/hooks";

export default function Privacy() {
  const { busy, run } = useAction();
  const { signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false), [txt, setTxt] = useState("");
  const download = async () => { const d = await run(() => api("/api/me/privacy/export")); if (!d) return; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" })); a.download = "petblitz-my-data.json"; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <>
      <h1>Privacy & your data</h1>
      <div className="card col"><h3>Download my data</h3><p className="muted">A JSON file with your profile, addresses, orders, wallet statement, support tickets, reviews and returns.</p><div><Button busy={busy} onClick={download}>Download my data</Button></div></div>
      <div className="card col"><h3>Delete my account</h3><p className="muted">Your personal details are erased and you are signed out. Order and invoice records are kept as required for tax law. You cannot delete while orders, refunds or returns are in progress or while your wallet holds a balance.</p><div><Button className="danger" onClick={() => setOpen(true)}>Delete my account…</Button></div></div>
      <Confirm open={open} onClose={() => setOpen(false)} danger busy={busy} title="Delete account" confirmLabel="Permanently delete" onConfirm={async () => { if (txt !== "DELETE MY ACCOUNT") return; if (await run(() => api("/api/me/privacy/delete", { method: "POST", body: { confirm: txt } }), "Account deleted")) { await signOut(); router.push("/"); } }}>
        <Alert kind="warn">This cannot be undone.</Alert><TextField label='Type "DELETE MY ACCOUNT" to confirm' value={txt} onChange={setTxt} /></Confirm>
    </>
  );
}
