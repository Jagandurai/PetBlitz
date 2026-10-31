"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { Empty, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/ui/hooks";

const links = [["/account", "Profile"], ["/account/orders", "Orders"], ["/track-order", "Track Order"], ["/account/addresses", "Addresses"], ["/account/wallet", "Wallet"], ["/account/returns", "Returns"], ["/account/support", "Support"], ["/account/privacy", "Privacy & data"]];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const path = usePathname();
  if (loading) return <Spinner />;
  if (!me) return <Empty>Please <Link href={`/login?next=${encodeURIComponent(path)}`}>sign in</Link> to view your account.</Empty>;
  return (
    <div className="grid" style={{ gridTemplateColumns: "210px 1fr", alignItems: "start" }}>
      <nav className="card side" aria-label="Account">{links.map(([h, l]) => <Link key={h} href={h} className={path === h || (h !== "/account" && path.startsWith(h)) ? "on" : ""}>{l}</Link>)}</nav>
      <div className="col" style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
