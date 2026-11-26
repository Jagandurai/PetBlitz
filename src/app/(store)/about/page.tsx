import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LuArrowRight, LuBadgeCheck, LuBookOpen, LuCircleHelp, LuCreditCard, LuHeadset, LuHeart, LuLogIn, LuMail, LuPackageCheck, LuRotateCcw, LuShieldCheck, LuShoppingCart, LuTruck, LuWallet } from "react-icons/lu";
import { FaPaw } from "react-icons/fa6";
import { CategoryIcon } from "@/components/home/category-icons";
import { homeCategories } from "@/components/home/categories";
import { homeFonts } from "@/components/home/fonts";
import { FaqList } from "@/components/store/faq-list";
import { SUPPORT_EMAIL } from "@/lib/content/pages";
import { getHomeCategories }from "@/services/homepage.service";
import "./about.css";

export const metadata: Metadata = {
  title: "About Us",
  description: "PetBlitz is an online pet accessories store delivering across India: grooming, toys, cat litter, hygiene, clothing and accessories.",
};
export const dynamic = "force-dynamic"; // category links follow what is currently visible in the store

const CATEGORY_TEXT: Record<string, string> = {
  grooming: "Brushes and care essentials for a clean, comfortable coat.",
  toys: "Playthings to keep curious minds and busy paws occupied.",
  litter: "Everyday litter needs for a fresher home with cats.",
  hygiene: "Helpful basics for your pet's daily cleanliness.",
  clothing: "Wearables and accessories for walks, outings and cosy days.",
};
const VALUES = [
  { icon: LuBadgeCheck, title: "Carefully selected", text: "Pet accessories chosen with everyday use in mind." },
  { icon: LuShieldCheck, title: "Secure payments", text: "Payments go through our payment provider. We don't store your card details." },
  { icon: LuTruck, title: "Delivery across India", text: "Order online and follow it from your account until it arrives." },
  { icon: LuHeadset, title: "Support when you need it", text: "Questions about a product or an order? Write to us." },
];
const STEPS = [
  { icon: LuLogIn, title: "Sign in", text: "Use your Google account." },
  { icon: LuShoppingCart, title: "Fill your cart", text: "Pick what suits your pet." },
  { icon: LuCreditCard, title: "Pay securely", text: "Check out and pay online." },
  { icon: LuPackageCheck, title: "Track your order", text: "Follow it from placement to delivery." },
];
const FAQS = [
  { q: "What does PetBlitz sell?", a: "Pet accessories, organised by category. Each listing shows its current price, availability and details." },
  { q: "Can I cancel an order?", a: "Yes, from My Orders, until it is shipped. If you had already paid, the paid amount is refunded to your PetBlitz wallet." },
  { q: "Can I return something?", a: "Delivered accessories can be returned within the return window. Open the order in My Orders to request it. Our Return Policy has the details." },
];

const Leaves = ({ className }: { className: string }) => (
  <svg className={className} viewBox="0 0 120 130">
    <path d="M40 130C8 108-2 62 8 26c26 20 40 62 32 104Z" fill="#7FBF3F" />
    <path d="M44 130C34 86 54 36 88 12c10 40-8 92-44 118Z" fill="#93D04C" />
    <path d="M46 130c10-34 36-54 70-56-6 32-32 54-70 56Z" fill="#6FAF35" />
  </svg>
);

export default async function AboutPage() {
  const categories = await getHomeCategories().catch(() => homeCategories(new Set()));
  return (
    <div className={`ab ${homeFonts}`}>
      <section className="ab-hero" aria-labelledby="ab-title">
        <div className="ab-hero-copy">
          <p className="ab-eyebrow"><FaPaw aria-hidden="true" /> About PetBlitz</p>
          <h1 id="ab-title">Made for pets and the people who love them</h1>
          <p>PetBlitz is an online store for pet accessories, delivered across India. From grooming to playtime, we want everyday pet care to feel simple.</p>
          <div className="ab-actions">
            <Link href="/products" className="ab-btn">Shop accessories <LuArrowRight aria-hidden="true" /></Link>
            <Link href="/blog" className="ab-btn ghost"><LuBookOpen aria-hidden="true" /> Read pet care tips</Link>
          </div>
        </div>
        <div className="ab-hero-art">
          <div className="ab-stage">
            <span className="ab-disc" aria-hidden="true" />
            <FaPaw className="ab-paw one" aria-hidden="true" />
            <FaPaw className="ab-paw two" aria-hidden="true" />
            <FaPaw className="ab-paw three" aria-hidden="true" />
            <svg className="ab-sparks" viewBox="0 0 60 58" aria-hidden="true"><path d="M13 5 9 28M43 15 25 37M55 43 33 52" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" /></svg>
            <span className="ab-shadow" aria-hidden="true" />
            <Image src="/images/home/about-golden-tabby.webp" alt="A happy golden retriever lying beside a tabby cat" width={1200} height={803} sizes="(max-width: 860px) 90vw, 540px" priority />
            <span className="ab-chip delivery"><LuTruck aria-hidden="true" /> Delivery across India</span>
            <span className="ab-chip secure"><LuShieldCheck aria-hidden="true" /> Secure payments</span>
          </div>
        </div>
      </section>

      <section className="ab-story" aria-labelledby="ab-story">
        <h2 id="ab-story">Little things make a big difference</h2>
        <div>
          <p>A good brush, a favourite toy, a clean litter corner: small things shape a pet&apos;s day. PetBlitz brings these accessories together in one place, so you can spend less time searching and more time together.</p>
          <p>We keep shopping clear. Products are grouped by category, and every listing shows its current price, availability and details before you buy.</p>
        </div>
      </section>

      <section aria-labelledby="ab-shop">
        <header className="ab-head"><h2 id="ab-shop">What we offer</h2><p>Find what your companion needs, by category.</p></header>
        <ul className="ab-cats">
          {categories.map((c) => (
            <li key={c.key}><Link href={c.href}><span className="ab-ic"><CategoryIcon name={c.key} /></span><h3>{c.name}</h3><p>{CATEGORY_TEXT[c.key]}</p></Link></li>
          ))}
        </ul>
      </section>

      <section className="ab-why" aria-labelledby="ab-why">
        <header className="ab-head"><h2 id="ab-why">Why shop with PetBlitz</h2></header>
        <ul>{VALUES.map(({ icon: Icon, title, text }) => <li key={title}><Icon aria-hidden="true" /><h3>{title}</h3><p>{text}</p></li>)}</ul>
      </section>

      <section aria-labelledby="ab-steps">
        <header className="ab-head"><h2 id="ab-steps">How ordering works</h2></header>
        <ol className="ab-steps">{STEPS.map(({ icon: Icon, title, text }) => <li key={title}><span className="ab-ic"><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></li>)}</ol>
      </section>

      <section className="ab-faq" aria-labelledby="ab-faq">
        <header className="ab-head"><h2 id="ab-faq">Good to know</h2></header>
        <FaqList items={FAQS} />
        <nav className="ab-links" aria-label="Policies and more questions">
          <Link href="/return-policy"><LuRotateCcw aria-hidden="true" /> Return Policy</Link>
          <Link href="/refund-policy"><LuWallet aria-hidden="true" /> Refund Policy</Link>
          <Link href="/faq"><LuCircleHelp aria-hidden="true" /> More questions</Link>
        </nav>
      </section>

      <section className="ab-cta" aria-labelledby="ab-help">
        <div className="ab-cta-pets">
          <Image src="/images/home/about-pet-trio.webp" alt="A tabby kitten and two puppies peeking over the edge of the panel" width={1400} height={524} sizes="(max-width: 760px) 94vw, 600px" />
          <svg className="ab-cta-sparks" viewBox="0 0 60 58" aria-hidden="true"><path d="M13 5 17 28M43 17 33 36M57 45 40 52" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /></svg>
          <LuHeart className="ab-cta-heart" aria-hidden="true" />
        </div>

        <div className="ab-cta-scene" aria-hidden="true">
          <svg className="ab-wave" viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M0 62C150 10 290 22 440 58S760 112 920 70 1110 24 1200 40V120H0Z" fill="currentColor" /></svg>
          <Leaves className="ab-leaves left" />
          <Leaves className="ab-leaves right" />
          <Image className="ab-toy rope" src="/hero/rope.webp" alt="" width={672} height={360} sizes="160px" />
          <Image className="ab-toy bone" src="/hero/plush-bone.webp" alt="" width={510} height={300} sizes="120px" />
          <Image className="ab-toy ball" src="/hero/ball.webp" alt="" width={324} height={324} sizes="60px" />
          <FaPaw className="ab-cta-paw left" />
          <FaPaw className="ab-cta-paw right" />
        </div>

        <h2 id="ab-help"><FaPaw aria-hidden="true" /><span>Need a Helping Paw?</span><FaPaw aria-hidden="true" /></h2>
        <p>Explore our pet care guides &amp; tips for a happier, healthier pet.</p>
        <div className="ab-actions">
          <Link href="/blog" className="ab-btn">Explore Blog <LuArrowRight aria-hidden="true" /></Link>
          <Link href="/contact" className="ab-btn light"><LuMail aria-hidden="true" /> Contact Us</Link>
        </div>
        <p className="ab-cta-help">Question about an order? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      </section>
    </div>
  );
}
