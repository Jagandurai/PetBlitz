import { NextResponse } from "next/server";
import { adminCookie } from "@/lib/auth/admin";
import { getEnv } from "@/lib/env";
import { enforceRateLimit, handle, ok } from "@/lib/http";
import { parseBody } from "@/lib/route";
import { clientIp } from "@/lib/rateLimit";
import { recordAudit } from "@/services/audit.service";
import { loginAdmin } from "@/services/admin-auth.service";
import { adminLoginSchema } from "@/validations/admin.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public. 10 attempts / 15 min / IP, plus a per-account lockout (5 failures => 15 min). Sets an HttpOnly SameSite=Strict session cookie. */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    await enforceRateLimit(req, "admin-login", 10, 15 * 60_000);
    const body = await parseBody(req, adminLoginSchema);
    const ctx = { ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? undefined };
    try {
      const r = await loginAdmin(body, ctx);
      await recordAudit({ actorType: "admin", actorId: r.admin.id, actorEmail: r.admin.email, role: r.admin.role, action: "POST /api/admin/auth/login", path: "/api/admin/auth/login", status: 200, ...ctx });
      const res = ok({ admin: r.admin, mfaSetupRequired: getEnv().ADMIN_REQUIRE_MFA === "true" && !r.admin.mfaEnabled });
      res.headers.append("Set-Cookie", adminCookie(r.token, getEnv().ADMIN_SESSION_HOURS));
      return res;
    } catch (e) {
      await recordAudit({ actorType: "anonymous", actorEmail: body.email, action: "POST /api/admin/auth/login", path: "/api/admin/auth/login", status: (e as { status?: number }).status ?? 500, ...ctx });
      throw e;
    }
  });
}
