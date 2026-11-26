import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { Product } from "@/models/Product";
import { facetsQuery } from "@/validations/catalog.validation";
import { getPublicCategoryIds, resolvePublicCategoryList } from "./category.service";

/**
 * Filter options for the storefront sidebar, computed from what is actually on sale right now (published, visible, in a publicly
 * eligible category). Brands are DATA, so adding a new brand in the admin shows up here automatically.
 */
const rows = (x: unknown) => (x as { _id: string; count: number }[]).map((a) => ({ value: a._id, count: a.count }));

export async function getFacets(raw: unknown) {
  await connectDB();
  const q = facetsQuery.parse(raw);
  const eligible = await getPublicCategoryIds();
  let ids = [...eligible].map((x) => new Types.ObjectId(x));
  if (q.category) {
    ids = (await resolvePublicCategoryList(q.category)).filter((i) => eligible.has(String(i)));
  }
  const base: Record<string, unknown> = { status: "published", isVisible: true, categoryId: { $in: ids } };
  const price = [{ $group: { _id: null, min: { $min: "$finalPrice" }, max: { $max: "$finalPrice" }, total: { $sum: 1 } } }];
  const onSale = [{ $match: { $expr: { $lt: ["$finalPrice", "$price"] } } }, { $count: "n" }];
  const [r] = await Product.aggregate([{ $match: base }, { $facet: {
    price, onSale,
    brands: [{ $match: { brand: { $type: "string", $ne: "" } } }, { $group: { _id: "$brand", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 60 }],
    animals: [{ $unwind: "$compatibility" }, { $group: { _id: "$compatibility", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
  } }]);
  return { kind: "products" as const, total: r.price[0]?.total ?? 0, priceRange: { min: r.price[0]?.min ?? 0, max: r.price[0]?.max ?? 0 }, onSale: r.onSale[0]?.n ?? 0,
    brands: rows(r.brands), animals: rows(r.animals) };
}
