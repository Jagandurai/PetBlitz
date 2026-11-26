import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import ProductView from "@/components/store/product-view";
import type { ProductData } from "@/components/store/types";
import { AppError } from "@/lib/errors";
import { getPublicProductBySlug } from "@/services/product.service";

export const dynamic = "force-dynamic";
const origin = () => process.env.APP_ORIGIN ?? "http://localhost:3000";
const cdn = (u?: string, w = 1200) => (u ? u.replace(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/)/, `$1f_auto,q_auto,c_limit,w_${w}/$2`) : undefined);

/** Server-fetched (SEO + fast first paint). Missing => 404; a database outage is NOT a 404, it surfaces the error page. */
const load = cache(async (slug: string): Promise<ProductData | null> => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  try { return JSON.parse(JSON.stringify(await getPublicProductBySlug(slug))) as ProductData; }
  catch (e) { if (e instanceof AppError && e.code === "NOT_FOUND") return null; throw e; }
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await load((await params).slug).catch(() => null);
  if (!p) return { title: "Not found" };
  const img = cdn(p.media.find((m) => m.isPrimary)?.url ?? p.media[0]?.url);
  const desc = (p.shortDescription ?? p.description ?? "").slice(0, 160);
  const url = `${origin()}/products/${p.slug}`;
  return { title: p.name, description: desc, alternates: { canonical: url }, openGraph: { title: p.name, description: desc, type: "website", url, images: img ? [{ url: img }] : undefined } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const p = await load((await params).slug);
  if (!p) notFound();
  const ld = {
    "@context": "https://schema.org", "@type": "Product", name: p.name, description: (p.description ?? p.shortDescription ?? "").slice(0, 500),
    image: p.media.filter((m) => m.kind === "image").map((m) => cdn(m.url)),
    sku: p.sku, brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
    offers: { "@type": "Offer", priceCurrency: "INR", price: (p.pricing.finalPrice / 100).toFixed(2), url: `${origin()}/products/${p.slug}`, availability: p.stockStatus === "out_of_stock" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock" },
    ...(p.rating.count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating.average, reviewCount: p.rating.count } } : {}),
  };
  return (<><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} /><ProductView p={p} /></>);
}
