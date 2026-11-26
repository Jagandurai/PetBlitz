"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { FiBox, FiHeart, FiHelpCircle, FiLogOut, FiMapPin, FiRefreshCw, FiShield, FiTruck, FiUser } from "react-icons/fi";
import { homeFonts } from "@/components/home/fonts";
import { Empty, Skel } from "@/components/store/ui";
import { useAuth } from "@/lib/ui/hooks";
import { CountBadge, useUnread } from "@/lib/ui/unread";
import "./account.css";

const links = [["/account", "Profile", FiUser], ["/account/orders", "My orders", FiBox], ["/account/addresses", "Addresses", FiMapPin], ["/account/wallet", "Wallet", FiHeart], ["/account/returns", "Returns", FiRefreshCw], ["/track-order", "Track an order", FiTruck], ["/account/support", "Support", FiHelpCircle], ["/account/privacy", "Privacy & data", FiShield]] as const;

/** The Google profile picture, or the first initial if there is none or it fails to load. */
function Avatar({ src, name }: { src?: string; name: string }) {
  const [broken, setBroken] = useState(false);
  return <span className="ac-avatar">{src && !broken ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : name.charAt(0).toUpperCase()}</span>;
}

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { me, loading, signOut } = useAuth();
  const path = usePathname();
  const unread = useUnread(me ? "/api/me/notifications" : null);
  const counts: Record<string, number> = { "/account/orders": unread.orders, "/account/support": unread.tickets };
  const nav = useRef<HTMLElement>(null);
  // on phones the menu scrolls sideways: bring the current page's tab into view
  useEffect(() => {
    const box = nav.current, on = box?.querySelector<HTMLElement>("a.on");
    if (box && on) box.scrollLeft = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2;
  }, [path, me]);
  if (loading) return <Skel h={300} />;
  if (!me) return <Empty icon="🔐" title="Please sign in" action={<Link className="sf-btn" href={`/login?next=${encodeURIComponent(path)}`}>Sign in</Link>}>Sign in to view your orders, wallet and saved addresses.</Empty>;
  const name = me.displayName ?? me.email;
  return (
    <div className={`ac ${homeFonts}`}>
      <aside className="ac-side">
        <div className="ac-user">
          <Avatar src={me.avatarUrl} name={name} />
          <div><b>{name}</b><span>{me.email}</span></div>
        </div>
        <nav ref={nav} className="ac-nav" aria-label="Account">
          {links.map(([h, l, I]) => {
            const on = path === h || (h !== "/account" && path.startsWith(h));
            return <Link key={h} href={h} className={on ? "on" : ""} aria-current={on ? "page" : undefined}><i><I size={17} aria-hidden="true" /></i>{l}<CountBadge n={counts[h]} /></Link>;
          })}
        </nav>
        <button type="button" className="ac-out" onClick={async () => { await signOut(); window.location.assign("/"); }}><FiLogOut aria-hidden="true" /> Sign out</button>
      </aside>
      <div className="ac-main">{children}</div>
    </div>
  );
}
