import { AppError } from "@/lib/errors";
import { ok } from "@/lib/http";
import { adminSelf, parseBody } from "@/lib/route";
import { changePassword } from "@/services/admin-auth.service";
import { adminPasswordSchema } from "@/validations/admin.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Changes the caller's own password and signs out every other session. Not available to the API-key identity. */
export const POST = adminSelf(async ({ req, actor }) => {
  const b = await parseBody(req, adminPasswordSchema);
  if (actor.via !== "session") throw new AppError("NOT_SUPPORTED", 422, "Sign in with an admin account to change a password");
  await changePassword(actor.id, b.current, b.next, actor.token);
  return ok({ changed: true });
});
