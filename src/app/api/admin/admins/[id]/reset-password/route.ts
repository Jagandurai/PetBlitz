import { ok } from "@/lib/http";
import { admin, idOf, parseBody } from "@/lib/route";
import { resetAdminPassword } from "@/services/admin-auth.service";
import { resetAdminPasswordSchema } from "@/validations/admin.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = admin<{ id: string }>(async ({ req, params }) => {
  await resetAdminPassword(idOf(params.id), (await parseBody(req, resetAdminPasswordSchema)).password);
  return ok({ reset: true });
});
