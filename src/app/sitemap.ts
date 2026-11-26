import type { MetadataRoute } from "next";
import { connectDB } from "@/lib/db/connection";
import { Blog } from "@/models/Blog";
import { Category } from "@/models/Category";
import { Product } from "@/models/Product";

export const dynamic = "force-dynamic";

/** Static pages + every published product and blog article + visible categories. If the database is unavailable only static URLs are listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const statics = ["", "/products", "/blog", "/about", "/faq", "/contact", "/support", "/return-policy", "/refund-policy", "/privacy-policy", "/terms"].map((p) => ({ url: `${origin}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.6 }));
  try {
    await connectDB();
    const [prods, cats, posts] = await Promise.all([
      Product.find({ status: "published", isVisible: true }, { slug: 1, updatedAt: 1 }).limit(5000).lean(),
      Category.find({ type: "accessory", isActive: true, isVisible: true, archivedAt: null }, { slug: 1, updatedAt: 1 }).limit(1000).lean(),
      Blog.find({ status: "published" }, { slug: 1, updatedAt: 1 }).limit(5000).lean(),
    ]);
    return [...statics,
      ...cats.map((c) => ({ url: `${origin}/products?category=${c.slug}`, lastModified: c.updatedAt, priority: 0.5 })),
      ...posts.map((p) => ({ url: `${origin}/blog/${p.slug}`, lastModified: p.updatedAt, priority: 0.7 })),
      ...prods.map((p) => ({ url: `${origin}/products/${p.slug}`, lastModified: p.updatedAt, priority: 0.8 }))];
  } catch { return statics; }
}
