import { clearAdminCookie } from "@/lib/auth/admin";
import { ok } from "@/lib/http";
import { adminSelf } from "@/lib/route";
import { logoutSession } from "@/services/admin-auth.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = adminSelf(async ({ actor }) => {
  if (actor.token) await logoutSession(actor.token);
  const res = ok({ signedOut: true });
  res.headers.append("Set-Cookie", clearAdminCookie());
  return res;
});
