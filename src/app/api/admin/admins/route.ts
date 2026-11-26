import { ok } from "@/lib/http";
import { admin, parseBody } from "@/lib/route";
import { createAdmin, listAdmins } from "@/services/admin-auth.service";
import { createAdminSchema } from "@/validations/admin.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner only (permission `admins.manage`). */
export const GET = admin(async () => ok({ admins: await listAdmins() }));
export const POST = admin(async ({ req, actor }) => ok(await createAdmin(await parseBody(req, createAdminSchema), actor.id), 201));
