import { createHash, timingSafeEqual } from "node:crypto";
import { assertSameOrigin } from "@/lib/auth/customer";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { AdminRole } from "@/models/Admin";

export const ADMIN_COOKIE = "pb_admin";
const API_KEY_OBJECT_ID = createHash("sha256").update("petblitz-admin-api-key").digest("hex").slice(0, 24);

export interface AdminPrincipal { id: string; objectId: string; email?: string; role: AdminRole; via: "api-key" | "session"; token?: string; mfaSetupRequired: boolean }

function cookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) { const i = part.indexOf("="); if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim(); }
  return null;
}
const same = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export const adminCookie = (token: string, hours: number) => `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${hours * 3600}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
export const clearAdminCookie = () => `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

/**
 * Identifies the caller. Two ways in:
 *  1. `Authorization: Bearer <ADMIN_API_KEY>` (break-glass / scripts; acts as `owner`; disable with ADMIN_API_KEY_ENABLED=false)
 *  2. the HttpOnly `pb_admin` session cookie from /api/admin/auth/login (role from the admin_users record; CSRF Origin check on writes)
 */
export async function authenticateAdmin(req: Request): Promise<AdminPrincipal> {
  const env = getEnv();
  const bearer = req.headers.get("authorization");
  if (bearer) {
    const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
    if (env.ADMIN_API_KEY && env.ADMIN_API_KEY_ENABLED === "true" && token && same(token, env.ADMIN_API_KEY)) return { id: "admin-api-key", objectId: API_KEY_OBJECT_ID, role: "owner", via: "api-key", mfaSetupRequired: false };
    throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
  }
  const token = cookie(req, ADMIN_COOKIE);
  if (!token) throw new AppError("UNAUTHORIZED", 401, "Unauthorized");
  assertSameOrigin(req); // CSRF: no-op for GET/HEAD, Origin must match for writes
  const { authenticateSession } = await import("@/services/admin-auth.service");
  const a = await authenticateSession(token);
  if (!a) throw new AppError("UNAUTHORIZED", 401, "Session expired");
  return { id: a.id, objectId: a.objectId, email: a.email, role: a.role, via: "session", token, mfaSetupRequired: env.ADMIN_REQUIRE_MFA === "true" && !a.mfaEnabled };
}
