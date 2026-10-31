import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/auth/customer";
import { verifyGoogleIdToken } from "@/lib/auth/google";
import { sessionCookie, signSession } from "@/lib/auth/session";
import { handle, ok, enforceRateLimit } from "@/lib/http";
import { parseBody } from "@/lib/route";
import { toCustomerProfile, upsertCustomerFromGoogle } from "@/services/customer.service";
import { notifyCustomer } from "@/services/email.service";
import { googleLoginSchema } from "@/validations/admin.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exchanges a Google ID token (from Google Identity Services on the storefront) for a signed, HttpOnly session cookie.
 * Needs GOOGLE_CLIENT_ID + SESSION_SECRET. The token is verified against Google's keys (signature, audience, expiry);
 * unverified emails are rejected and an email owned by another Google identity is never auto-linked.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    await enforceRateLimit(req, "auth", 20);
    assertSameOrigin(req);
    const { idToken } = await parseBody(req, googleLoginSchema);
    const profile = await verifyGoogleIdToken(idToken);
    const { customer, created } = await upsertCustomerFromGoogle(profile);
    if (created) await notifyCustomer(customer._id, "welcome", {}, `welcome:${customer._id}`);
    const res = ok({ customer: toCustomerProfile(customer), created }, created ? 201 : 200);
    res.headers.append("Set-Cookie", sessionCookie(signSession(String(customer._id))));
    return res;
  });
}
