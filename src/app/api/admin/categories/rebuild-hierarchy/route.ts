import { admin } from "@/lib/route";
import { ok } from "@/lib/http";
import * as C from "@/services/category.service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recovery tool: recomputes path/level for every category from parentId (the source of truth). */
export const POST = admin(async () => ok(await C.rebuildCategoryHierarchy()));