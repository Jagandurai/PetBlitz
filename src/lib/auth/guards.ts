import { createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

export interface AdminActor {
  /** Human-readable actor id (stored in order status history etc.). */
  id: string;
  /** Stable ObjectId-shaped id for audit columns (createdBy / updatedBy / moderatedBy). */
  objectId: string;
  role: string;
}

// Single API-key admin => one stable pseudo identity. Replace with real admin_users._id when RBAC arrives.
const API_KEY_ACTOR_OBJECT_ID = createHash("sha256").update("petblitz-admin-api-key").digest("hex").slice(0, 24);

/**
 * PLACEHOLDER admin authorization: a static bearer key (ADMIN_API_KEY) compared in constant time.
 * Replace with real admin authentication (admin_users + sessions / SSO + RBAC) when the Admin Portal is built.
 * Every admin-only route/service must go through this single function, so the swap is a one-file change.
 */
export function requireAdmin(req: Request): AdminActor {
  const key = getEnv().ADMIN_API_KEY;
  if (!key) throw new AppError("ADMIN_NOT_CONFIGURED", 503, "Admin access is not configured");
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(key).digest();
  if (!token || !timingSafeEqual(a, b)) throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
  return { id: "admin-api-key", objectId: API_KEY_ACTOR_OBJECT_ID, role: "admin" };
}

/** Scheduler access: a SEPARATE secret (CRON_SECRET) so cron services never hold the admin key. */
export function requireCron(req: Request): void {
  const key = getEnv().CRON_SECRET;
  if (!key) throw new AppError("CRON_NOT_CONFIGURED", 503, "Scheduler endpoint is not configured");
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(key).digest();
  if (!token || !timingSafeEqual(a, b)) throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
}
