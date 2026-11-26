import { NextResponse } from "next/server";
import { adminCookie } from "@/lib/auth/admin";
import { assertSameOrigin } from "@/lib/auth/customer";
import { verifyGoogleIdToken } from "@/lib/auth/google";
import { getEnv } from "@/lib/env";
import { enforceRateLimit, handle, ok } from "@/lib/http";
import { parseBody } from "@/lib/route";
import { clientIp } from "@/lib/rateLimit";
import { recordAudit } from "@/services/audit.service";
import { loginAdminWithGoogle } from "@/services/admin-auth.service";
import { googleLoginSchema } from "@/validations/admin.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public. Exchanges a Google ID token for an admin session, only for authorised admin e-mails. */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    await enforceRateLimit(req, "admin-login", 10, 15 * 60_000);
    assertSameOrigin(req);
    const { idToken } = await parseBody(req, googleLoginSchema);
    const profile = await verifyGoogleIdToken(idToken);
    const ctx = { ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? undefined };
    try {
      const r = await loginAdminWithGoogle(profile, ctx);
      await recordAudit({ actorType: "admin", actorId: r.admin.id, actorEmail: r.admin.email, role: r.admin.role, action: "POST /api/admin/auth/google", path: "/api/admin/auth/google", status: 200, ...ctx });
      const res = ok({ admin: r.admin, mfaSetupRequired: false });
      res.headers.append("Set-Cookie", adminCookie(r.token, getEnv().ADMIN_SESSION_HOURS));
      return res;
    } catch (e) {
      await recordAudit({ actorType: "anonymous", actorEmail: profile.email, action: "POST /api/admin/auth/google", path: "/api/admin/auth/google", status: (e as { status?: number }).status ?? 500, ...ctx });
      throw e;
    }
  });
}
