import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArticleBody } from "@/components/blog/article";
import { PostCard } from "@/components/blog/card";
import { Crumbs } from "@/components/store/ui";
import { AppError } from "@/lib/errors";
import { cdn } from "@/lib/ui/cdn";
import { getPublicBlogBySlug } from "@/services/blog.service";

export const dynamic = "force-dynamic"; // unpublishing takes effect immediately
const origin = () => process.env.APP_ORIGIN ?? "http://localhost:3000";

/** Published articles only. Missing, draft or archived => 404; a database outage surfaces the error page instead. */
const load = cache(async (slug: string) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  try { return await getPublicBlogBySlug(slug); }
  catch (e) { if (e instanceof AppError && e.code === "NOT_FOUND") return null; throw e; }
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await load((await params).slug).catch(() => null);
  if (!data) return { title: "Not found", robots: { index: false } };
  const p = data.post;
  const title = p.seoTitle ?? p.title;
  const description = p.seoDescription ?? p.excerpt;
  const url = `${origin()}/blog/${p.slug}`;
  const image = cdn(p.coverImage?.url, 1200);
  return {
    title, description, alternates: { canonical: url }, authors: p.author ? [{ name: p.author }] : undefined,
    openGraph: { title, description, type: "article", url, publishedTime: p.publishedAt, modifiedTime: p.updatedAt, tags: p.tags, images: image ? [{ url: image, alt: p.coverImage?.alt || p.title }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const data = await load((await params).slug);
  if (!data) notFound();
  const { post: p, related } = data;
  const ld = {
    "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, description: p.seoDescription ?? p.excerpt,
    image: p.coverImage ? [cdn(p.coverImage.url, 1200)] : undefined, datePublished: p.publishedAt, dateModified: p.updatedAt,
    author: { "@type": "Person", name: p.author }, publisher: { "@type": "Organization", name: "PetBlitz", logo: { "@type": "ImageObject", url: `${origin()}/logo.png` } },
    articleSection: p.category, keywords: p.tags.join(", ") || undefined, mainEntityOfPage: `${origin()}/blog/${p.slug}`,
  };
  return (
    <>
      {/* "<" is escaped, so article text can never close the script tag */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }, { label: p.title }]} />
      <ArticleBody a={p} tagLink={(t) => <Link href={`/blog?tag=${encodeURIComponent(t)}`}>#{t}</Link>} />
      {related.length > 0 && <section className="bl-related" aria-label="Related articles"><h2>Related articles</h2><div className="bl-grid">{related.map((r) => <PostCard key={r.id} p={r} heading="h3" />)}</div></section>}
    </>
  );
}
