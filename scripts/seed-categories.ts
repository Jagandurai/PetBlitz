import "./_env";
import { connectDB, disconnectDB } from "@/lib/db/connection";
import { Category } from "@/models/Category";
import { createCategory } from "@/services/category.service";
import { INITIAL_CATEGORIES, SeedNode } from "./data/initial-categories";

/**
 * Idempotent: a seed node is identified by `seedKey`. If a record with that key exists (even if an admin renamed,
 * moved, hid or archived it) it is left COMPLETELY untouched. Only missing nodes are created.
 */
const dry = process.argv.includes("--dry-run");
const summary = { created: [] as string[], skipped: [] as string[], warnings: [] as string[] };

async function seed(node: SeedNode, parentId: string | null) {
  const existing = await Category.findOne({ seedKey: node.key }).lean();
  if (existing) {
    summary.skipped.push(node.key);
    for (const c of node.children ?? []) await seed(c, String(existing._id));
    return;
  }
  if (await Category.exists({ $or: [{ slug: node.slug }, { slugHistory: node.slug }] })) {
    summary.warnings.push(`slug "${node.slug}" already used by a non-seed category; "${node.key}" NOT created (resolve manually)`);
    return;
  }
  if (dry) {
    summary.created.push(`${node.key} (dry-run)`);
    for (const c of node.children ?? []) await seedDry(c);
    return;
  }
  try {
    const created = await createCategory(
      { name: node.name, slug: node.slug, type: node.type, parentId, sortOrder: node.sortOrder },
      { seedKey: node.key, allowInactiveParent: true },
    );
    summary.created.push(node.key);
    for (const c of node.children ?? []) await seed(c, created.id);
  } catch (e) {
    summary.warnings.push(`"${node.key}" not created: ${(e as Error).message}`);
  }
}
async function seedDry(node: SeedNode) {
  if (!(await Category.exists({ seedKey: node.key }))) summary.created.push(`${node.key} (dry-run)`);
  for (const c of node.children ?? []) await seedDry(c);
}

(async () => {
  await connectDB();
  for (const root of INITIAL_CATEGORIES) await seed(root, null);
  console.log(JSON.stringify({ dryRun: dry, ...summary }, null, 2));
  await disconnectDB();
})().catch(async (e) => {
  console.error("Seed failed:", e instanceof Error ? e.message.replace(/mongodb(\+srv)?:\/\/\S+/gi, "[redacted]") : "unknown");
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
