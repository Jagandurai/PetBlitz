"use client";
import Link from "next/link";
import { FiLogOut, FiMenu, FiShoppingCart, FiUser, FiX } from "react-icons/fi";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/ui/hooks";
import { SUPPORT_EMAIL } from "@/lib/content/pages";

const NAV = [["/", "Home"], ["/dogs", "Dogs"], ["/cats", "Cats"], ["/accessories", "Accessories"], ["/about", "About Us"], ["/contact", "Contact Us"]] as const;
const SOCIAL = [["Facebook", process.env.NEXT_PUBLIC_FACEBOOK_URL], ["Instagram", process.env.NEXT_PUBLIC_INSTAGRAM_URL], ["X", process.env.NEXT_PUBLIC_X_URL], ["YouTube", process.env.NEXT_PUBLIC_YOUTUBE_URL]].filter((s): s is [string, string] => !!s[1]);

function Header() {
  const { me, loading, cartCount, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  const on = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const account = loading ? null : me ? <Link className="btn ghost sm" href="/account"><FiUser /> My Account</Link> : <Link className="btn sm" href="/login">Sign in</Link>;
  return (
    <header className="hdr noprint">
      <div className="container in">
        <Link href="/" className="logo"><img src="/logo.png" alt="PetBlitz" /></Link>
        <nav className="nav hide-m" aria-label="Main">
          {NAV.map(([h, l]) => <Link key={h} href={h} className={on(h) ? "on" : ""} aria-current={on(h) ? "page" : undefined}>{l}</Link>)}
        </nav>
        <div className="hdr-act">
          <span className="hide-m">{account}</span>
          <Link className="btn ghost sm" href="/cart" aria-label={`Cart, ${cartCount} items`}><FiShoppingCart /> <span className="hide-m">Cart</span>{cartCount > 0 && <span className="badge info">{cartCount}</span>}</Link>
          <button className="btn ghost sm show-m menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(true)}><FiMenu /></button>
        </div>
      </div>
      {open && (
        <div className="drawer-bg" onClick={() => setOpen(false)}>
          <aside className="drawer" role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <div className="row between"><strong>Menu</strong><button className="btn ghost sm" aria-label="Close menu" onClick={() => setOpen(false)}><FiX /></button></div>
            {NAV.map(([h, l]) => <Link key={h} href={h} className={on(h) ? "on" : ""}>{l}</Link>)}
            <Link href="/account" className={on("/account") ? "on" : ""}>{me ? "My Account" : "Sign in"}</Link>
            <Link href="/cart">Cart{cartCount > 0 ? ` (${cartCount})` : ""}</Link>
            {me && <button className="btn ghost" onClick={async () => { await signOut(); router.push("/"); }}><FiLogOut /> Sign out</button>}
          </aside>
        </div>
      )}
    </header>
  );
}

const COLS: [string, [string, string][]][] = [
  ["Shop", [["/dogs", "Dogs"], ["/cats", "Cats"], ["/accessories", "Accessories"]]],
  ["Account", [["/account", "My Account"], ["/track-order", "Track Your Order"], ["/support", "Support"]]],
  ["Company", [["/about", "About Us"], ["/contact", "Contact Us"]]],
  ["Policies", [["/refund-policy", "Refund Policy"], ["/return-policy", "Return Policy"], ["/privacy-policy", "Privacy Policy"], ["/terms", "Terms & Conditions"]]],
];

function Footer() {
  return (
    <footer className="ftr noprint">
      <div className="container">
        <div className="grid g5">
          <div className="col">
            <img src="/logo.png" alt="PetBlitz" style={{ height: 40, width: "auto", alignSelf: "flex-start" }} />
            <p className="small">Dogs, cats and pet accessories, delivered across India.</p>
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            {SOCIAL.length > 0 && <div className="row">{SOCIAL.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noopener noreferrer">{n}</a>)}</div>}
          </div>
          {COLS.map(([t, links]) => <nav key={t} className="col" aria-label={t}><strong>{t}</strong>{links.map(([h, l]) => <Link key={h} href={h}>{l}</Link>)}</nav>)}
        </div>
        <p className="small center mt">© {new Date().getFullYear()} PetBlitz · petblitz.in</p>
      </div>
    </footer>
  );
}

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Header />
      <main className="container" style={{ paddingTop: 16, minHeight: "60vh" }}>{children}</main>
      <Footer />
    </AuthProvider>
  );
}
