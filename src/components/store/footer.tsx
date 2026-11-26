/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/content/pages";
import { FaAmazon, FaHeart, FaInstagram, FaPaw, FaYoutube } from "react-icons/fa6";
import { FiMail, FiShield, FiRefreshCw, FiTruck, FiCreditCard } from "react-icons/fi";
import "./footer.css";

export const TrustRow = () => (
  <div className="sf-trust">
    {[[FiShield, "Genuine products", "Quality pet accessories and essentials"], [FiTruck, "Careful delivery", "Tracked shipping across India"], [FiCreditCard, "Secure payments", "UPI, cards, netbanking via Razorpay"], [FiRefreshCw, "Instant wallet refunds", "Cancelled orders refund in seconds"]].map(([Icon, t, d]) => { const I = Icon as typeof FiShield; return <div className="sf-tr" key={t as string}><I size={24} /><div><b>{t as string}</b><span>{d as string}</span></div></div>; })}
  </div>
);

const COLUMNS: { title: string; links: [string, string][] }[] = [
  { title: "Shop", links: [["/products", "Accessories"], ["/products?onSale=true", "Offers & deals"], ["/products?sort=newest", "New arrivals"], ["/wishlist", "Wishlist"]] },
  { title: "My account", links: [["/account", "Profile"], ["/account/orders", "Orders"], ["/account/wallet", "Wallet"], ["/track-order", "Track order"], ["/account/returns", "Returns"]] },
  { title: "Help", links: [["/faq", "FAQ"], ["/support", "Support"], ["/contact", "Contact"], ["/return-policy", "Return policy"], ["/refund-policy", "Refund policy"]] },
  { title: "Company", links: [["/about", "About us"], ["/blog", "Blog"], ["/privacy-policy", "Privacy policy"], ["/terms", "Terms of use"]] },
];

/** Paste a page address to turn its icon into a link; an empty one is shown as "coming soon". */
const SOCIAL = [
  { key: "instagram", name: "Instagram", icon: FaInstagram, href: "https://www.instagram.com/petblitz2026?gwpx=bjM3azdjcDA2cXV1" },
  { key: "amazon", name: "Amazon", icon: FaAmazon, href: "" },
  { key: "youtube", name: "YouTube", icon: FaYoutube, href: "" },
];
const DEVELOPER_URL = "https://www.linkedin.com/in/jagandurai";

export function Footer() {
  return (
    <footer className="sf-foot">
      <FaPaw className="ft-paw" aria-hidden="true" />
      <div className="sf-wrap ft-grid">
        <div className="ft-brand">
          <div className="ft-id">
            <Link href="/" className="ft-logo"><img src="/logo.webp" alt="PetBlitz home" width={1166} height={768} loading="lazy" /></Link>
            <p>Everything your pet needs — from people who love animals.</p>
          </div>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="ft-mail"><FiMail aria-hidden="true" />{SUPPORT_EMAIL}</a>
          <ul className="ft-social" aria-label="Follow us">
            {SOCIAL.map(({ key, name, icon: Icon, href }) => (
              <li key={key}>
                {href
                  ? <a href={href} className={key} target="_blank" rel="noopener noreferrer" aria-label={`PetBlitz on ${name} (opens in a new tab)`} title={name}><Icon aria-hidden="true" /></a>
                  : <span className={`${key} soon`} role="img" aria-label={`${name}: coming soon`} title={`${name}: coming soon`}><Icon aria-hidden="true" /></span>}
              </li>
            ))}
          </ul>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} className="ft-col" aria-label={col.title}>
            <h2>{col.title}</h2>
            <ul>{col.links.map(([href, label]) => <li key={href}><Link href={href}>{label}</Link></li>)}</ul>
          </nav>
        ))}
      </div>
      <div className="ft-bar">
        <div className="sf-wrap ft-bottom">
          <span>© {new Date().getFullYear()} PetBlitz · petblitz.in</span>
          <a href={DEVELOPER_URL} className="ft-credit" target="_blank" rel="noopener noreferrer" aria-label="Designed and developed by Jagan. Opens LinkedIn in a new tab" title="Jagan on LinkedIn">
            Designed and developed by <FaHeart className="ft-heart" aria-hidden="true" /> <b>Jagan</b>
          </a>
          <div className="ft-pay">
            <span><FiShield aria-hidden="true" /> Payments secured by Razorpay · INR</span>
            {["UPI", "Cards", "Netbanking"].map((m) => <span key={m} className="ft-chip">{m}</span>)}
          </div>
        </div>
      </div>
    </footer>
  );
}
