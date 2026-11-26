/** The five shop categories, shared by the homepage tiles and the header menu so both always link to the same place. */
import type { HomeCategory } from "./types";

/** Each entry links to the first publicly visible category matching one of its slugs, in order. */
export const HOME_CATEGORIES: { key: HomeCategory["key"]; name: string; slugs: string[] }[] = [
  { key: "grooming", name: "Grooming", slugs: ["grooming", "grooming-essentials"] },
  { key: "toys", name: "Toys", slugs: ["toys", "interactive-toys"] },
  { key: "litter", name: "Cat Litter", slugs: ["cat-litter", "litter"] },
  { key: "hygiene", name: "Hygiene", slugs: ["hygiene"] },
  { key: "clothing", name: "Clothing & Accessories", slugs: ["clothing-accessories", "clothing-and-accessories", "clothing"] },
];

/** `available` holds the slugs of public categories. An entry with no matching category opens the full product list. */
export function homeCategories(available: Set<string>): HomeCategory[] {
  return HOME_CATEGORIES.map(({ key, name, slugs }) => {
    const slug = slugs.find((s) => available.has(s));
    return { key, name, href: slug ? `/products?category=${slug}` : "/products" };
  });
}
