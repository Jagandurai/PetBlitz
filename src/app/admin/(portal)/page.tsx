"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FaDog } from "react-icons/fa";
import { FiAlertTriangle, FiArrowRight, FiCheckCircle, FiDollarSign, FiDownload, FiRefreshCw, FiShoppingBag, FiUsers } from "react-icons/fi";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorBox, Spinner } from "@/components/ui";
import { useAdmin } from "@/lib/ui/admin";
import { inr } from "@/lib/ui/format";
import { useApi, useToast } from "@/lib/ui/hooks";

interface Dash { sales: { last7: { revenue: number; orders: number }; last30: { revenue: number; orders: number } }; queues: Record<string, number>; totals: { petsAvailable: number; customers: number }; daily: { date: string; revenue: number; orders: number }[] }
const Q: [string, string, string, string][] = [["toAccept", "Paid — to accept", "/admin/orders?status=placed&paymentStatus=paid", "#ea7a0c"], ["toShip", "To ship", "/admin/orders?status=confirmed", "#0f766e"], ["unpaid", "Awaiting payment", "/admin/orders?status=placed&paymentStatus=pending", "#f59e0b"], ["openReturns", "Open returns", "/admin/returns", "#b91c1c"], ["openTickets", "Open tickets", "/admin/tickets", "#2563eb"], ["pendingReviews", "Reviews to moderate", "/admin/reviews", "#7c3aed"], ["lowStock", "Low-stock products", "/admin/products?lowStock=true", "#64748b"]];
const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const compact = (minor: number) => { const r = minor / 100; return r >= 1e5 ? `₹${(r / 1e5).toFixed(1)}L` : r >= 1e3 ? `₹${(r / 1e3).toFixed(1)}k` : `₹${Math.round(r)}`; };

function Kpi({ label, value, sub, icon, tone }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; tone: string }) {
  return <div className="kpi"><div className="kpi-ic" style={{ background: `${tone}1a`, color: tone }}>{icon}</div><div><span className="kpi-l">{label}</span><b className="kpi-v">{value}</b>{sub && <span className="kpi-s">{sub}</span>}</div></div>;
}

export default function Dashboard() {
  const { me } = useAdmin();
  const { toast } = useToast();
  const [period, setPeriod] = useState("daily"), [from, setFrom] = useState(""), [to, setTo] = useState(""), [dl, setDl] = useState(false);
  const download = async () => {
    setDl(true);
    try {
      const qs = new URLSearchParams({ period, ...(from ? { from } : {}), ...(to ? { to } : {}) });
      const res = await fetch(`/api/admin/dashboard/report?${qs}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(res.status === 403 ? "You don't have permission to download reports" : "Could not generate the report");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a"); a.href = url; a.download = `petblitz-sales-${period}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast(`${period[0]!.toUpperCase()}${period.slice(1)} report downloaded`, "ok");
    } catch (e) { toast((e as Error).message, "err"); } finally { setDl(false); }
  };
  const { data, loading, error, reload } = useApi<Dash>("/api/admin/dashboard");
  const series = useMemo(() => {
    if (!data) return [];
    const by = new Map(data.daily.map((d) => [d.date, d]));
    const out: { date: string; label: string; revenue: number; orders: number }[] = [];
    for (let i = 13; i >= 0; i--) { const dt = new Date(); dt.setDate(dt.getDate() - i); const k = dt.toISOString().slice(0, 10); const d = by.get(k); out.push({ date: k, label: short(k), revenue: d?.revenue ?? 0, orders: d?.orders ?? 0 }); }
    return out;
  }, [data]);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error ?? "Failed"} retry={reload} />;
  const queues = Q.map(([k, l, h, c]) => ({ k, l, h, c, v: data.queues[k] ?? 0 }));
  const pending = queues.reduce((s, q) => s + q.v, 0);
  const pie = queues.filter((q) => q.v > 0);
  const aov = data.sales.last30.orders ? data.sales.last30.revenue / data.sales.last30.orders : 0;
  const name = me?.email?.split("@")[0] ?? "there";
  return (
    <>
      <div className="dash-hero">
        <div><h1>Welcome back, {name}</h1><p>{pending ? `${pending} item${pending > 1 ? "s" : ""} need your attention today.` : "You're all caught up — nothing needs attention."}</p></div>
        <div className="row hero-actions">
          <select className="hero-sel" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Report period"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
          <input type="date" className="hero-sel" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" title="From (optional)" />
          <input type="date" className="hero-sel" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" title="To (optional)" />
          <button className="btn sm hero-btn" disabled={dl} onClick={download}><FiDownload /> {dl ? "Preparing…" : "Download report"}</button>
          <button className="btn sm hero-btn" onClick={reload}><FiRefreshCw /> Refresh</button>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Revenue · 7 days" value={inr(data.sales.last7.revenue)} sub={`${data.sales.last7.orders} paid orders`} icon={<FiDollarSign />} tone="#0f766e" />
        <Kpi label="Revenue · 30 days" value={inr(data.sales.last30.revenue)} sub={`Avg order ${inr(Math.round(aov))}`} icon={<FiShoppingBag />} tone="#ea7a0c" />
        <Kpi label="Pets available" value={data.totals.petsAvailable} sub="Listed for sale" icon={<FaDog />} tone="#2563eb" />
        <Kpi label="Active customers" value={data.totals.customers} sub="Registered accounts" icon={<FiUsers />} tone="#7c3aed" />
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="row between"><h2>Revenue · last 14 days</h2><span className="badge info">Paid orders</span></div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
                <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} /><stop offset="100%" stopColor="#0f766e" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e9ee" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={compact} width={56} />
                <Tooltip formatter={(v) => [inr(Number(v)), "Revenue"]} contentStyle={{ borderRadius: 10, border: "1px solid #e5e9ee" }} />
                <Area type="monotone" dataKey="revenue" stroke="#0f766e" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2>Needs attention</h2>
          {pie.length ? <div style={{ height: 170 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pie} dataKey="v" nameKey="l" innerRadius={52} outerRadius={78} paddingAngle={3} stroke="none">{pie.map((p) => <Cell key={p.k} fill={p.c} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
            : <div className="center muted" style={{ padding: "36px 0" }}><FiCheckCircle size={36} color="#15803d" /><p>All clear</p></div>}
          <div className="qlist">{queues.map((q) => <Link key={q.k} href={q.h} className="qrow"><span className="dot" style={{ background: q.c }} /><span className="grow">{q.l}</span><b className={q.v ? "" : "muted"}>{q.v}</b><FiArrowRight className="muted" /></Link>)}</div>
        </div>

        <div className="card">
          <div className="row between"><h2>Orders per day</h2><span className="badge">14 days</span></div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e9ee" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, "Orders"]} contentStyle={{ borderRadius: 10, border: "1px solid #e5e9ee" }} />
                <Bar dataKey="orders" fill="#ea7a0c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2>Quick actions</h2>
          <div className="qa">
            <Link href="/admin/orders" className="btn ghost"><FiShoppingBag /> Manage orders</Link>
            <Link href="/admin/products/new" className="btn ghost">Add product</Link>
            <Link href="/admin/pets/new" className="btn ghost"><FaDog /> Add pet</Link>
            <Link href="/admin/tickets" className="btn ghost"><FiAlertTriangle /> Support tickets</Link>
          </div>
        </div>
      </div>
    </>
  );
}
