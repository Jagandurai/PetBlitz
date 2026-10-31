import { ok } from "@/lib/http";
import { admin, idOf, parseBody } from "@/lib/route";
import { updateAdmin } from "@/services/admin-auth.service";
import { updateAdminSchema } from "@/validations/admin.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Role/active changes sign that admin out everywhere. The last active owner cannot be demoted or disabled. */
export const PATCH = admin<{ id: string }>(async ({ req, actor, params }) => ok(await updateAdmin(idOf(params.id), await parseBody(req, updateAdminSchema), actor.objectId)));
