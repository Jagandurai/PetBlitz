import type { Metadata } from "next";
import Link from "next/link";
import { homeFonts } from "@/components/home/fonts";
import { PageHelp, PageHero, PageTabs } from "@/components/page-parts";
import { FaqList } from "@/components/store/faq-list";
import { Crumbs } from "@/components/store/ui";
import { SUPPORT_EMAIL } from "@/lib/content/pages";

export const metadata: Metadata = { title: "Help & FAQ", description: "Answers about ordering, payments, wallet refunds, delivery, returns and more." };

const FAQ: { q: string; a: React.ReactNode }[] = [
  { q: "How do I place an order?", a: <>Add items to your cart, go to checkout, choose or add a delivery address, review the totals and pay. You&apos;ll need to sign in with Google first so we can save your cart and orders.</> },
  { q: "Which payment methods are accepted?", a: <>UPI, debit/credit cards and netbanking via Razorpay, or your PetBlitz wallet balance. We never see or store your card details.</> },
  { q: "What is the PetBlitz wallet?", a: <>A balance on your account. Refunds for cancelled orders and approved returns are credited to it instantly, and you can use it at checkout or top it up from <Link href="/account/wallet">Wallet</Link>. Wallet money is for shopping on PetBlitz and cannot be withdrawn to a bank account.</> },
  { q: "Can I cancel my order?", a: <>Yes, from <Link href="/account/orders">My orders</Link>, while it is still placed, accepted or confirmed. If you had paid, the full amount goes back to your wallet immediately. After processing starts, please <Link href="/contact">contact us</Link>.</> },
  { q: "How is shipping calculated?", a: <>Shipping is shown at checkout for your address. Many orders qualify for free shipping above a minimum order value — the progress bar in your cart shows how close you are.</> },
  { q: "How long will delivery take?", a: <>Accessories usually arrive in about 3–7 business days after dispatch; you&apos;ll get tracking details by e-mail.</> },
  { q: "How do I track my order?", a: <>Open the order in <Link href="/account/orders">My orders</Link> or use <Link href="/track-order">Track order</Link>. Once shipped you&apos;ll also receive the courier name and tracking number by e-mail.</> },
  { q: "Do you provide GST invoices?", a: <>Yes. A GST tax invoice is generated when your order ships and is available to print or save from the order page.</> },
  { q: "What is your return policy?", a: <>See our <Link href="/return-policy">Return policy</Link> and <Link href="/refund-policy">Refund policy</Link>. In short: eligible accessories can be returned within the return window after delivery from <Link href="/account/returns">Returns</Link>.</> },
  { q: "How do I use a coupon?", a: <>Enter the code in your cart or at checkout. You&apos;ll see the exact discount before you pay. Coupons may have minimum order values, expiry dates and usage limits.</> },
  { q: "Is my personal data safe? Can I delete my account?", a: <>We only collect what we need to deliver your order. You can download your data or delete your account from <Link href="/account/privacy">Privacy &amp; data</Link> (not possible while orders, refunds or wallet balance are outstanding). Read our <Link href="/privacy-policy">Privacy policy</Link>.</> },
  { q: "I still need help", a: <>Open a request from <Link href="/account/support">Support</Link> or write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — we reply within one business day.</> },
];

export default function Page() {
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.q } })) };
  return (
    <div className={`pg ${homeFonts}`}>
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Help & FAQ" }]} />
      <PageHero eyebrow="PetBlitz help centre" title="Help & FAQ" intro="Quick answers to the things customers ask most. Point at a question to see its answer, or tap it." />
      <PageTabs current="faq" />
      <FaqList items={FAQ} />
      <PageHelp />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    </div>
  );
}
