import { Model } from "mongoose";
import { connectDB } from "./connection";
import { CORE_MODELS, SUPPORT_MODELS } from "@/models";

export const ALL_MODELS: Record<string, Model<any>> = { ...CORE_MODELS, ...SUPPORT_MODELS } as unknown as Record<string, Model<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface DuplicateReport { collection: string; index: string; keys: Record<string, 1 | -1>; duplicates: number; sample: unknown[] }

type IndexSpec = [Record<string, 1 | -1>, Record<string, any>]; // eslint-disable-line @typescript-eslint/no-explicit-any

function uniqueSpecs(model: Model<any>): IndexSpec[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (model.schema.indexes() as IndexSpec[]).filter(([, o]) => o.unique);
}

/** Looks for existing documents that would make a unique index fail to build. Read-only. */
export async function findUniqueConflicts(): Promise<DuplicateReport[]> {
  await connectDB();
  const out: DuplicateReport[] = [];
  for (const [name, model] of Object.entries(ALL_MODELS)) {
    for (const [keys, opts] of uniqueSpecs(model)) {
      const fields = Object.keys(keys);
      const match: Record<string, unknown> = { ...(opts.partialFilterExpression ?? {}) };
      for (const f of fields) if (!(f in match)) match[f] = { $exists: true };
      const groups = await model.collection
        .aggregate([{ $match: match }, { $group: { _id: Object.fromEntries(fields.map((f) => [f.replace(/\./g, "_"), `$${f}`])), n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $limit: 5 }], { allowDiskUse: true })
        .toArray();
      if (groups.length) out.push({ collection: name, index: fields.join("_"), keys, duplicates: groups.length, sample: groups.map((g) => g._id) });
    }
  }
  return out;
}

export interface IndexResult { collection: string; created: string[]; existing: string[]; skippedBecauseOfDuplicates: boolean; error?: string }

/**
 * Creates (never drops) the indexes declared on the schemas. Collections with unique conflicts are skipped and reported.
 * `dryRun` only reports what would be created.
 */
export async function createAllIndexes(opts: { dryRun?: boolean } = {}): Promise<IndexResult[]> {
  const m = await connectDB();
  const conflicts = await findUniqueConflicts();
  const conflicted = new Set(conflicts.map((c) => c.collection));
  const existingCollections = new Set((await m.connection.db!.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const results: IndexResult[] = [];
  for (const [name, model] of Object.entries(ALL_MODELS)) {
    const r: IndexResult = { collection: name, created: [], existing: [], skippedBecauseOfDuplicates: conflicted.has(name) };
    if (r.skippedBecauseOfDuplicates) { results.push(r); continue; }
    try {
      const have = existingCollections.has(model.collection.name) ? new Set((await model.collection.indexes()).map((i) => i.name)) : new Set<string>();
      for (const [keys, o] of model.schema.indexes() as IndexSpec[]) {
        const idxName = o.name ?? Object.entries(keys).map(([k, v]) => `${k}_${v}`).join("_");
        (have.has(idxName) ? r.existing : r.created).push(idxName);
      }
      if (!opts.dryRun) await model.createIndexes(); // creates the collection if needed; never drops anything
    } catch (e) {
      r.error = e instanceof Error ? e.message.replace(/mongodb(\+srv)?:\/\/\S+/gi, "[redacted]") : "unknown error";
    }
    results.push(r);
  }
  return results;
}
