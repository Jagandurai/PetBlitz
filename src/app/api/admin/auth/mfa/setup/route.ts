import { AppError } from "@/lib/errors";
import { ok } from "@/lib/http";
import { adminSelf } from "@/lib/route";
import { beginMfaSetup } from "@/services/admin-auth.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Step 1: returns the TOTP secret + otpauth:// URL (render as a QR code). Shown once. */
export const POST = adminSelf(async ({ actor }) => {
  if (actor.via !== "session") throw new AppError("NOT_SUPPORTED", 422, "MFA applies to admin accounts, not the API key");
  return ok(await beginMfaSetup(actor.id));
});
