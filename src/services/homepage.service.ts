import { connectDB } from "@/lib/db/connection";
import { Category } from "@/models/Category";
import { Product, ProductDoc } from "@/models/Product";
import { HOME_CATEGORIES, homeCategories } from "@/components/home/categories";
import type { HomeCategory, HomeData } from "@/components/home/types";
import type { ProductData } from "@/components/store/types";
import { getBannerSlots } from "./banner.service";
import { getPublicCategoryIds } from "./category.service";
import { toPublicProduct } from "./product.service";

const NEW_ARRIVALS_COUNT = 8;
const FEATURED_COUNT = 8;

// ---------------------------------------------------------------- categories
export { HOME_CATEGORIES, homeCategories };

export async function getHomeCategories(): Promise<HomeCategory[]> {
  await connectDB();
  const eligible = await getPublicCategoryIds();
  const rows = await Category.find({ _id: { $in: [...eligible] }, slug: { $in: HOME_CATEGORIES.flatMap((c) => c.slugs) } }, { slug: 1 }).lean();
  return homeCategories(new Set(rows.map((r) => r.slug)));
}

// ---------------------------------------------------------------- products
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

async function publicProducts(extra: Record<string, unknown>, limit: number) {
  const eligible = await getPublicCategoryIds();
  const rows = (await Product.find({ ...extra, status: "published", isVisible: true, categoryId: { $in: [...eligible] } }).sort({ publishedAt: -1, createdAt: -1 }).limit(limit).lean()) as ProductDoc[];
  const cats = await Category.find({ _id: { $in: rows.map((r) => r.categoryId) } }, { name: 1, slug: 1 }).lean();
  const names = new Map(cats.map((c) => [String(c._id), { name: c.name, slug: c.slug }]));
  return plain(rows.map((r) => toPublicProduct(r, names.get(String(r.categoryId))))) as unknown as ProductData[];
}

/** Current data for specific products, in the order asked for. Anything not publicly viewable is silently left out. */
export async function getPublicProductsByIds(ids: string[]) {
  await connectDB();
  if (!ids.length) return [];
  const found = await publicProducts({ _id: { $in: ids } }, ids.length);
  const byId = new Map(found.map((p) => [p.id, p]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Published, visible products an admin marked "Featured on home page". */
export async function getFeaturedProducts() {
  await connectDB();
  return publicProducts({ isFeatured: true }, FEATURED_COUNT);
}

export async function getNewArrivals() {
  await connectDB();
  return publicProducts({}, NEW_ARRIVALS_COUNT);
}

// ---------------------------------------------------------------- page data
/** Everything the homepage needs. Each section fails on its own: one broken query never takes down the page. */
export async function getPublicHomeData(): Promise<HomeData> {
  const guard = async <T,>(label: string, run: () => Promise<T>, fallback: T) => { try { return await run(); } catch (e) { console.error(`[homepage] ${label} failed`, e instanceof Error ? e.message : e); return fallback; } };
  const [categories, banners, newArrivals, featured] = await Promise.all([
    guard("categories", getHomeCategories, homeCategories(new Set())),
    guard("banners", async () => (await getBannerSlots()).map(({ slot, heading, paragraph, imageUrl }) => ({ slot, heading, paragraph, imageUrl })), []),
    guard("new arrivals", getNewArrivals, []),
    guard("featured products", getFeaturedProducts, []),
  ]);
  return { categories, banners, newArrivals, featured };
}
