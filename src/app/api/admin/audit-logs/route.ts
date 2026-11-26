import { ok } from "@/lib/http";
import { admin, queryOf } from "@/lib/route";
import { listAuditLogs } from "@/services/audit.service";
import { auditQuery } from "@/validations/admin.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin(async ({ req }) => ok(await listAuditLogs(auditQuery.parse(queryOf(req)))));
