import { ROLE_PERMISSIONS } from "@/lib/auth/rbac";
import { ok } from "@/lib/http";
import { adminSelf } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who am I + what may I do (the admin UI hides what the role cannot use; the server still enforces everything). */
export const GET = adminSelf(async ({ actor }) => ok({ id: actor.id, email: actor.email, role: actor.role, via: actor.via, mfaSetupRequired: actor.mfaSetupRequired, permissions: ROLE_PERMISSIONS[actor.role] }));
