import Link from "next/link";
import { LuArrowRight } from "react-icons/lu";
import { Cover, Meta } from "./article";
import type { BlogCard } from "@/services/blog.service";
import { BLOG_LAYOUT } from "@/lib/ui/image-presets";

const THUMB = { aspectRatio: BLOG_LAYOUT.thumbnail };

export function PostCard({ p, heading: H = "h2" }: { p: BlogCard; heading?: "h2" | "h3" }) {
  return (
    <article className="bl-card">
      <div className="bl-card-img" style={THUMB}><Cover src={p.coverImage?.url} alt={p.coverImage?.alt || p.title} width={640} />{p.category && <span className="bl-badge">{p.category}</span>}</div>
      <div className="bl-card-body">
        <H><Link href={`/blog/${p.slug}`} className="bl-stretch">{p.title}</Link></H>
        <p>{p.excerpt}</p>
        <Meta author={p.author} publishedAt={p.publishedAt} readingMinutes={p.readingMinutes} />
      </div>
    </article>
  );
}

export function FeaturedPost({ p }: { p: BlogCard }) {
  return (
    <article className="bl-featured">
      <div className="bl-featured-img" style={THUMB}><Cover src={p.coverImage?.url} alt={p.coverImage?.alt || p.title} width={1100} eager /></div>
      <div className="bl-featured-body">
        <div className="bl-featured-tags"><span className="bl-badge gold">Featured</span>{p.category && <span className="bl-badge">{p.category}</span>}</div>
        <h2><Link href={`/blog/${p.slug}`} className="bl-stretch">{p.title}</Link></h2>
        <p>{p.excerpt}</p>
        <Meta author={p.author} publishedAt={p.publishedAt} readingMinutes={p.readingMinutes} />
        <span className="bl-read">Read article <LuArrowRight size={16} aria-hidden="true" /></span>
      </div>
    </article>
  );
}
