import { OAuth2Client } from "google-auth-library";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { GoogleProfile } from "@/validations/customer.validation";

/** Verifies a Google ID token (signature, audience, expiry) with Google's public keys. Needs GOOGLE_CLIENT_ID. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const clientId = getEnv().GOOGLE_CLIENT_ID;
  if (!clientId) throw new AppError("AUTH_NOT_CONFIGURED", 503, "Google sign-in is not configured");
  try {
    const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken, audience: clientId });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email) throw new Error("incomplete");
    return { sub: p.sub, email: p.email, email_verified: p.email_verified === true, name: p.name, given_name: p.given_name, family_name: p.family_name, picture: p.picture };
  } catch {
    throw new AppError("INVALID_ID_TOKEN", 401, "Invalid Google credential");
  }
}
