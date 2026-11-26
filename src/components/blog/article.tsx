/* eslint-disable @next/next/no-img-element */
/** Article presentation, shared by the public page and the admin preview. No client hooks: it renders on the server too. */
import { Fragment, ReactNode } from "react";
import { LuCalendar, LuClock, LuPawPrint, LuUserRound } from "react-icons/lu";
import { RichNode, isSafeHref, isSafeImageSrc } from "@/lib/blog-content";
import { cdn } from "@/lib/ui/cdn";
import { BLOG_LAYOUT } from "@/lib/ui/image-presets";

/** IST everywhere, so server and browser always render the same date. */
export const blogDate = (d?: string) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "");

export function Meta({ author, publishedAt, readingMinutes }: { author?: string; publishedAt?: string; readingMinutes?: number }) {
  return (
    <div className="bl-meta">
      {author && <span><LuUserRound size={14} aria-hidden="true" />{author}</span>}
      {publishedAt && <span><LuCalendar size={14} aria-hidden="true" /><time dateTime={publishedAt}>{blogDate(publishedAt)}</time></span>}
      {!!readingMinutes && <span><LuClock size={14} aria-hidden="true" />{readingMinutes} min read</span>}
    </div>
  );
}

export function Cover({ src, alt, width, eager }: { src?: string; alt: string; width: number; eager?: boolean }) {
  return src ? <img src={cdn(src, width)} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" /> : <span className="bl-noimg" role="img" aria-label={alt}><LuPawPrint size={42} /></span>;
}

function node(n: RichNode, key: number): ReactNode {
  const kids = n.content?.map(node);
  switch (n.type) {
    case "text": {
      let out: ReactNode = n.text;
      for (const m of n.marks ?? []) {
        if (m.type === "bold") out = <strong>{out}</strong>;
        else if (m.type === "italic") out = <em>{out}</em>;
        else if (m.type === "link" && m.attrs?.href && isSafeHref(m.attrs.href)) out = <a href={m.attrs.href} {...(/^https?:/i.test(m.attrs.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{out}</a>;
      }
      return <Fragment key={key}>{out}</Fragment>;
    }
    case "paragraph": return <p key={key}>{kids}</p>;
    case "heading": { const H = n.attrs?.level === 3 ? "h3" : n.attrs?.level === 4 ? "h4" : "h2"; return <H key={key}>{kids}</H>; }
    case "bulletList": return <ul key={key}>{kids}</ul>;
    case "orderedList": return <ol key={key} start={n.attrs?.start ?? 1}>{kids}</ol>;
    case "listItem": return <li key={key}>{kids}</li>;
    case "blockquote": return <blockquote key={key}>{kids}</blockquote>;
    case "hardBreak": return <br key={key} />;
    case "horizontalRule": return <hr key={key} />;
    case "image": return n.attrs?.src && isSafeImageSrc(n.attrs.src) ? <figure key={key}><img src={cdn(n.attrs.src, 1200)} alt={n.attrs.alt ?? ""} loading="lazy" decoding="async" /></figure> : null;
    default: return null; // unknown node types are never rendered
  }
}

export const RichContent = ({ doc }: { doc?: RichNode }) => <div className="bl-prose">{doc?.content?.map(node)}</div>;

export interface ArticleViewData { title: string; excerpt?: string; category?: string; author?: string; publishedAt?: string; readingMinutes?: number; coverImage?: { url: string; alt?: string }; tags?: string[]; content?: RichNode }

export function ArticleBody({ a, tagLink }: { a: ArticleViewData; tagLink?: (tag: string) => ReactNode }) {
  return (
    <article className="bl-article">
      <header className="bl-art-head">
        {a.category && <span className="bl-badge">{a.category}</span>}
        <h1>{a.title}</h1>
        {a.excerpt && <p className="bl-lead">{a.excerpt}</p>}
        <Meta author={a.author} publishedAt={a.publishedAt} readingMinutes={a.readingMinutes} />
      </header>
      {a.coverImage?.url && <div className="bl-art-cover" style={{ aspectRatio: BLOG_LAYOUT.cover }}><Cover src={a.coverImage.url} alt={a.coverImage.alt || a.title} width={1600} eager /></div>}
      <RichContent doc={a.content} />
      {!!a.tags?.length && <ul className="bl-tags" aria-label="Tags">{a.tags.map((t) => <li key={t}>{tagLink ? tagLink(t) : <span>#{t}</span>}</li>)}</ul>}
    </article>
  );
}
