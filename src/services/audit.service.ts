import { connectDB } from "@/lib/db/connection";
import { AuditLog } from "@/models/Admin";

export interface AuditEntry { actorType: "admin" | "api-key" | "anonymous"; actorId?: string; actorEmail?: string; role?: string; action: string; path: string; targetId?: string; status: number; ip?: string; userAgent?: string }

/** Never throws: an audit-write failure must not turn a successful admin action into an error (it is logged instead). */
export async function recordAudit(e: AuditEntry): Promise<void> {
  try {
    await connectDB();
    await AuditLog.create({ ...e, userAgent: e.userAgent?.slice(0, 300) });
  } catch (err) {
    console.error("[audit] write failed", err instanceof Error ? err.name : "error", e.action, e.status);
  }
}

export async function listAuditLogs(q: { page: number; pageSize: number; actorId?: string; method?: string }) {
  await connectDB();
  const f: Record<string, unknown> = {};
  if (q.actorId) f.actorId = q.actorId;
  if (q.method) f.action = new RegExp(`^${q.method} `);
  const [items, total] = await Promise.all([AuditLog.find(f).sort({ at: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(), AuditLog.countDocuments(f)]);
  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}
