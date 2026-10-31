/**
 * INITIAL SEED DATA ONLY. This file is used exclusively by scripts/seed-categories.ts and is NEVER imported by
 * application code. After seeding, administrators own these records and may rename/move/hide/archive them.
 * `key` is the stable seed identity (stored as Category.seedKey) so re-runs never duplicate or overwrite edits.
 */
export interface SeedNode { key: string; name: string; slug: string; type?: "dog" | "cat" | "accessory"; sortOrder: number; children?: SeedNode[] }

export const INITIAL_CATEGORIES: SeedNode[] = [
  { key: "dogs", name: "Dogs", slug: "dogs", type: "dog", sortOrder: 10, children: [
    { key: "dogs-labrador", name: "Labrador", slug: "labrador", sortOrder: 10 },
    { key: "dogs-golden-retriever", name: "Golden Retriever", slug: "golden-retriever", sortOrder: 20 },
    { key: "dogs-german-shepherd", name: "German Shepherd", slug: "german-shepherd", sortOrder: 30 },
  ] },
  { key: "cats", name: "Cats", slug: "cats", type: "cat", sortOrder: 20, children: [
    { key: "cats-persian", name: "Persian", slug: "persian", sortOrder: 10 },
    { key: "cats-bengal", name: "Bengal", slug: "bengal", sortOrder: 20 },
    { key: "cats-british-shorthair", name: "British Shorthair", slug: "british-shorthair", sortOrder: 30 },
  ] },
  { key: "accessories", name: "Accessories", slug: "accessories", type: "accessory", sortOrder: 30, children: [
    { key: "acc-litter", name: "Litter", slug: "litter", sortOrder: 10 },
    { key: "acc-interactive-toys", name: "Interactive Toys", slug: "interactive-toys", sortOrder: 20 },
    { key: "acc-grooming-essentials", name: "Grooming Essentials", slug: "grooming-essentials", sortOrder: 30 },
    { key: "acc-walking-essentials", name: "Walking Essentials", slug: "walking-essentials", sortOrder: 40 },
    { key: "acc-other", name: "Other Accessories", slug: "other-accessories", sortOrder: 50 },
  ] },
];
