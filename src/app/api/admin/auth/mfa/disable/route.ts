import { AppError } from "@/lib/errors";
import { ok } from "@/lib/http";
import { adminSelf, parseBody } from "@/lib/route";
import { disableMfa } from "@/services/admin-auth.service";
import { mfaDisableSchema } from "@/validations/admin.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = adminSelf(async ({ req, actor }) => {
  const b = await parseBody(req, mfaDisableSchema);
  if (actor.via !== "session") throw new AppError("NOT_SUPPORTED", 422, "MFA applies to admin accounts, not the API key");
  await disableMfa(actor.id, b.password, b.code);
  return ok({ disabled: true });
});
