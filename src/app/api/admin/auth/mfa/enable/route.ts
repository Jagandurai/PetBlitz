import { AppError } from "@/lib/errors";
import { ok } from "@/lib/http";
import { adminSelf, parseBody } from "@/lib/route";
import { enableMfa } from "@/services/admin-auth.service";
import { mfaEnableSchema } from "@/validations/admin.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Step 2: confirm with a code from the authenticator app. Returns 8 single-use recovery codes (shown once). */
export const POST = adminSelf(async ({ req, actor }) => {
  const b = await parseBody(req, mfaEnableSchema);
  if (actor.via !== "session") throw new AppError("NOT_SUPPORTED", 422, "MFA applies to admin accounts, not the API key");
  return ok(await enableMfa(actor.id, b.code));
});
