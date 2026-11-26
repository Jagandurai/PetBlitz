"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { FaPaw } from "react-icons/fa6";
import { LuArrowRight } from "react-icons/lu";

/** Three short accent strokes beside a pet. */
const Sparks = ({ className }: { className: string }) => (
  <svg className={className} viewBox="0 0 60 58" aria-hidden="true"><path d="M13 5 9 28M43 15 25 37M55 43 33 52" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" /></svg>
);

/** Fixed quick-access strip to the blog. One link covers the whole banner and holds the button. */
export function BlogQuickAccessBanner() {
  const ref = useRef<HTMLDivElement>(null);

  // Runs once per mount (unlike useReveal), so the entrance never replays. Content stays visible without JS.
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window) || el.getBoundingClientRect().top < innerHeight) return;
    el.classList.add("is-waiting");
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { el.classList.remove("is-waiting"); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(el);
    return () => { io.disconnect(); el.classList.remove("is-waiting"); };
  }, []);

  return (
    <section className="hp-blog" data-section="blog-banner" aria-labelledby="hp-blog-title">
      <div ref={ref} className="hp-wrap hp-blog-in">
        <div className="hp-blog-card">
          <div className="hp-blog-brand" aria-hidden="true"><FaPaw className="paw" /><span>PetBlitz</span><i><FaPaw /></i></div>
          <Image className="hp-blog-pets" src="/images/home/blog-dog-cat.webp" alt="" width={640} height={476} sizes="220px" />
          <Sparks className="hp-blog-sparks pets" />
          <div className="hp-blog-copy">
            <h2 id="hp-blog-title">Pet Care Blog</h2>
            <p>Care tips, grooming guides &amp; pet lifestyle.</p>
          </div>
          <Image className="hp-blog-toys" src="/images/home/blog-toys.webp" alt="" width={384} height={130} sizes="260px" />
          <Image className="hp-blog-puppy" src="/images/home/blog-puppy-peek.webp" alt="" width={362} height={236} sizes="220px" />
          <Sparks className="hp-blog-sparks puppy" />
          <Link href="/blog" className="hp-blog-hit" aria-label="Read the blog: explore the PetBlitz Pet Care Blog"><span className="hp-blog-btn">Read the Blog <LuArrowRight aria-hidden="true" /></span></Link>
        </div>
      </div>
    </section>
  );
}
