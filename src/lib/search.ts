import { escapeRegex } from "@/lib/sanitize";

/**
 * Runs a listing query with a `$text` search. If the text index has not been created yet (MongoDB error 27, IndexNotFound) the
 * query is retried once with an escaped, case-insensitive regex so search keeps working until `npm run db:indexes` is run.
 */
export async function withTextFallback<T>(useText: boolean, filter: Record<string, unknown>, q: string | undefined, orKey: string, orBuilder: (r: RegExp) => unknown[], run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (!useText || !q || code !== 27) throw e;
    delete filter.$text;
    filter[orKey] = orBuilder(new RegExp(escapeRegex(q), "i"));
    return run();
  }
}
