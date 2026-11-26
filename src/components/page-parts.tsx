import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import { LuArrowRight, LuCircleHelp, LuFileText, LuHeadset, LuMail, LuRotateCcw, LuShieldCheck, LuWallet } from "react-icons/lu";
import { FaPaw } from "react-icons/fa6";
import { SUPPORT_EMAIL } from "@/lib/content/pages";
import "./page-parts.css";

/** Shared look for the help and policy pages. */
const HELP_PAGES = [
  { slug: "faq", label: "FAQ", icon: LuCircleHelp },
  { slug: "return-policy", label: "Return Policy", icon: LuRotateCcw },
  { slug: "refund-policy", label: "Refund Policy", icon: LuWallet },
  { slug: "privacy-policy", label: "Privacy Policy", icon: LuShieldCheck },
  { slug: "terms", label: "Terms", icon: LuFileText },
];

export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: ReactNode }) {
  // the last word carries the hand-drawn underline
  const words = title.split(" ");
  const last = words.pop();
  return (
    <header className="pg-banner">
      <div className="pg-hero">
        <svg className="pg-land" viewBox="0 0 2054 446" preserveAspectRatio="none" aria-hidden="true">
          <path d="M930 446C905 300 975 190 1150 183S1330 55 1520 43s250 100 360 105 160 140 174 220v78Z" fill="#D5EBB4" />
          <path d="M0 340C170 450 420 365 660 400s330 40 520-20 520 30 874-125V446H0Z" fill="#BEDD8E" />
          <path d="M0 360C120 440 330 385 520 415s330 20 520 25 700 0 1014-125V446H0Z" fill="#74A83F" />
        </svg>
        <FaPaw className="pg-deco one" aria-hidden="true" />
        <FaPaw className="pg-deco two" aria-hidden="true" />
        <svg className="pg-sparks" viewBox="0 0 80 90" aria-hidden="true"><path d="M60 8 70 36M25 30 44 52M8 68 34 76" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" /></svg>
        <span className="pg-heart" aria-hidden="true">
          <svg viewBox="0 0 120 120"><path d="M62 108C30 90 8 66 12 40 16 16 46 8 60 34 70 6 104 8 108 34c5 28-20 54-46 74Z" fill="none" stroke="currentColor" strokeWidth="8" strokeLinejoin="round" /></svg>
          <FaPaw />
        </span>
        <div className="pg-hero-copy">
          <p className="pg-eyebrow"><FaPaw aria-hidden="true" /> {eyebrow}</p>
          <h1 className={title.length > 16 ? "is-long" : undefined}>
            {words.length > 0 && `${words.join(" ")} `}
            <span className="pg-mark-word">
              {last}
              <svg viewBox="0 0 250 30" preserveAspectRatio="none" aria-hidden="true"><path d="M6 24C70 6 170 3 244 13" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></svg>
            </span>
          </h1>
          <p className="pg-intro">{intro}</p>
        </div>
        <Image className="pg-hero-pet" src="/images/home/help-hero-pets.webp" alt="A golden puppy and a tabby kitten resting on a green mat with pet toys" width={1300} height={580} sizes="(max-width: 760px) 94vw, 520px" priority />
      </div>
    </header>
  );
}

export function PageTabs({ current }: { current: string }) {
  return (
    <nav className="pg-tabs" aria-label="Help and policies">
      {HELP_PAGES.map(({ slug, label, icon: Icon }) => <Link key={slug} href={`/${slug}`} aria-current={slug === current ? "page" : undefined}><Icon aria-hidden="true" />{label}</Link>)}
    </nav>
  );
}

export function PageHelp() {
  return (
    <aside className="pg-help">
      <span className="pg-help-ic"><LuHeadset aria-hidden="true" /></span>
      <div><h2>Still need a helping paw?</h2><p>Send us a message or email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p></div>
      <div className="pg-help-actions">
        <Link href="/contact" className="pg-btn">Contact us <LuArrowRight aria-hidden="true" /></Link>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="pg-btn light"><LuMail aria-hidden="true" /> Email</a>
      </div>
    </aside>
  );
}
