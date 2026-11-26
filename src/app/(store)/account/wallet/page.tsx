"use client";
import { useState } from "react";
import { Badge, Button, ErrorBox, Pager, Spinner, TextField } from "@/components/ui";
import { errText } from "@/lib/ui/api";
import { dt, inr, rupeesToMinor, title } from "@/lib/ui/format";
import { useApi, useAuth, useToast } from "@/lib/ui/hooks";
import { topUpWallet } from "@/lib/ui/razorpay";

interface Wallet { balance: number; transactions: { id: string; type: "credit" | "debit"; amount: number; balanceAfter: number; reason: string; description?: string; createdAt: string }[]; total: number; pageSize: number }

export default function WalletPage() {
  const { me, refresh } = useAuth();
  const { toast } = useToast();
  const [page, setPage] = useState(1), [amt, setAmt] = useState("500"), [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useApi<Wallet>(`/api/me/wallet?page=${page}&pageSize=15`);
  const topup = async () => {
    setBusy(true);
    try { const r = await topUpWallet(rupeesToMinor(amt), { name: me?.displayName, email: me?.email, contact: me?.phone }); toast(r.handled ? "Wallet topped up" : "Payment is being confirmed…", "ok"); setTimeout(async () => { await refresh(); reload(); }, r.handled ? 0 : 3000); }
    catch (e) { toast(errText(e), "err"); } finally { setBusy(false); }
  };
  return (
    <>
      <h1>Wallet</h1>
      <div className="grid g2">
        <div className="card"><div className="muted small">Available balance</div><b style={{ fontSize: "2rem" }}>{inr(data?.balance ?? me?.wallet.balance)}</b><p className="small muted">Refunds from cancelled orders and returns land here instantly. Use it at checkout.</p></div>
        <div className="card col"><h3>Add money</h3><div className="row">{[500, 1000, 2000, 5000].map((v) => <Button key={v} className="ghost sm" onClick={() => setAmt(String(v))}>₹{v}</Button>)}</div>
          <TextField label="Amount (₹)" type="number" value={amt} onChange={setAmt} min={100} /><Button busy={busy} disabled={Number(amt) < 100} onClick={topup}>Add ₹{amt || 0}</Button><span className="small muted">Secure payment by Razorpay. Wallet money cannot be withdrawn to a bank account.</span></div>
      </div>
      <h2>Statement</h2>
      {loading ? <Spinner /> : error ? <ErrorBox msg={error} retry={reload} /> : <div className="card flush tw"><table className="t"><thead><tr><th>Date</th><th>Details</th><th className="right">Amount</th><th className="right">Balance</th></tr></thead><tbody>
        {data?.transactions.length ? data.transactions.map((t) => <tr key={t.id}><td className="small nowrap">{dt(t.createdAt)}</td><td>{title(t.reason)} {t.description && <span className="muted small">· {t.description}</span>}</td><td className="right"><Badge status={t.type === "credit" ? "ok" : "bad"} label={`${t.type === "credit" ? "+" : "−"}${inr(t.amount)}`} /></td><td className="right">{inr(t.balanceAfter)}</td></tr>) : <tr><td colSpan={4} className="center muted">No transactions yet</td></tr>}
      </tbody></table></div>}
      <Pager page={page} totalPages={Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 15)))} onPage={setPage} />
    </>
  );
}
