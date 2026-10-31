"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { FaDog } from "react-icons/fa";
import { FiBarChart2, FiCornerUpLeft, FiFileText, FiGlobe, FiLayers, FiList, FiLock, FiLogOut, FiMenu, FiMessageSquare, FiPackage, FiSettings, FiShield, FiStar, FiTag, FiUsers } from "react-icons/fi";
import { Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/ui/api";
import { AdminCtx, AdminMe } from "@/lib/ui/admin";
import { useToast } from "@/lib/ui/hooks";

const NAV: { group: string; items: [string, string, string, ReactNode][] }[] = [
  { group: "Overview", items: [["/admin", "Dashboard", "orders.read", <FiBarChart2 />]] },
  { group: "Sales", items: [["/admin/orders", "Orders", "orders.read", <FiFileText />], ["/admin/returns", "Returns", "orders.read", <FiCornerUpLeft />], ["/admin/customers", "Customers", "customers.read", <FiUsers />], ["/admin/coupons", "Coupons", "catalog.read", <FiTag />]] },
  { group: "Catalog", items: [["/admin/categories", "Categories", "catalog.read", <FiLayers />], ["/admin/pets", "Pets", "catalog.read", <FaDog />], ["/admin/products", "Products", "catalog.read", <FiPackage />]] },
  { group: "Community", items: [["/admin/reviews", "Reviews", "support.read", <FiStar />], ["/admin/tickets", "Support tickets", "support.read", <FiMessageSquare />]] },
  { group: "System", items: [["/admin/settings", "Store settings", "settings.read", <FiSettings />], ["/admin/admins", "Admins", "admins.manage", <FiShield />], ["/admin/audit", "Audit log", "audit.read", <FiList />], ["/admin/account", "Account & security", "", <FiLock />]] },
];

export default function PortalLayout({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const router = useRouter(), path = usePathname();
  const load = useCallback(() => { api<AdminMe>("/api/admin/auth/me").then(setMe).catch((e) => { if (e instanceof ApiError && e.status === 401) router.replace("/admin/login"); else setErr(e.message); }); }, [router]);
  useEffect(load, [load]);
  useEffect(() => { if (me?.mfaSetupRequired && path !== "/admin/account") router.replace("/admin/account"); }, [me, path, router]);
  // Auto sign-out after IDLE_MS of no activity (admin dashboard only; shared across tabs via localStorage)
  const signedIn = !!me;
  useEffect(() => {
    if (!signedIn) return;
    const KEY = "pb_admin_last_active", IDLE_MS = 15 * 60_000;
    let lastWrite = 0, lastPing = Date.now();
    const mark = () => {
      const now = Date.now();
      if (now - lastWrite < 5_000) return;
      lastWrite = now; localStorage.setItem(KEY, String(now));
      if (now - lastPing > 5 * 60_000) { lastPing = now; api("/api/admin/auth/me").catch(() => undefined); } // keeps the server session alive while active
    };
    localStorage.setItem(KEY, String(Date.now()));
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const timer = window.setInterval(async () => {
      if (Date.now() - Number(localStorage.getItem(KEY) ?? 0) < IDLE_MS) return;
      window.clearInterval(timer);
      await api("/api/admin/auth/logout", { method: "POST" }).catch(() => undefined);
      toast("Signed out after 15 minutes of inactivity", "err");
      router.replace("/admin/login");
    }, 15_000);
    return () => { events.forEach((e) => window.removeEventListener(e, mark)); window.clearInterval(timer); };
  }, [signedIn, router, toast]);
  if (err) return <div className="container mt"><div className="alert err">{err}</div></div>;
  if (!me) return <Spinner />;
  const can = (p: string) => !p || me.permissions.includes(p);
  const isOn = (h: string) => path === h || (h !== "/admin" && path.startsWith(h));
  const current = NAV.flatMap((g) => g.items.map((i) => ({ ...({ h: i[0], l: i[1], g: g.group }) }))).filter((i) => isOn(i.h)).sort((a, b) => b.h.length - a.h.length)[0];
  const signOut = async () => { await api("/api/admin/auth/logout", { method: "POST" }).catch(() => undefined); toast("Signed out", "ok"); router.replace("/admin/login"); };
  const initial = (me.email ?? "A").charAt(0).toUpperCase();
  return (
    <AdminCtx.Provider value={{ me, can, reload: load }}>
      <div className={"adm" + (open ? " open" : "")}>
        <div className="sb-bg" onClick={() => setOpen(false)} />
        <aside className="sb" aria-label="Admin navigation">
          <Link href="/admin" className="brand" onClick={() => setOpen(false)}><img src="/logo.png" alt="PetBlitz" className="brand-logo" /></Link>
          <nav>
            {NAV.map((g) => { const items = g.items.filter(([, , p]) => can(p)); return items.length ? <div key={g.group}><div className="grp">{g.group}</div>{items.map(([h, l, , ic]) => <Link key={h} href={h} onClick={() => setOpen(false)} className={isOn(h) ? "on" : ""}><span className="ic">{ic}</span>{l}</Link>)}</div> : null; })}
          </nav>
          <div className="sb-foot">
            <Link href="/" target="_blank"><span className="ic"><FiGlobe /></span>View storefront ↗</Link>
            <a href="#" onClick={(e) => { e.preventDefault(); void signOut(); }}><span className="ic"><FiLogOut /></span>Logout</a>
          </div>
        </aside>
        <div className="main-wrap">
          <header className="topbar">
            <button className="menu-btn" aria-label="Toggle menu" onClick={() => setOpen((v) => !v)}><FiMenu /></button>
            <div className="crumbs"><span className="muted small">{current?.g ?? "Admin"} /</span><strong>{current?.l ?? "Admin"}</strong></div>
            <div className="grow" />
            <div className="who"><span className="avatar">{initial}</span><span className="hide-m"><span className="nm">{me.email ?? "API key"}</span><span className="rl">{me.role}</span></span></div>
          </header>
          <div className="main">{children}</div>
        </div>
      </div>
    </AdminCtx.Provider>
  );
}

