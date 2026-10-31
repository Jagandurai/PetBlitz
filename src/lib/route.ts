import { NextResponse } from "next/server";
import { ZodType } from "zod";
import { CustomerSession, requireCustomer } from "@/lib/auth/customer";
import { AppError } from "@/lib/errors";
import { enforceRateLimit, handle } from "@/lib/http";

/** Next.js 15 passes dynamic params as a Promise. */
export type Ctx<P extends Record<string, string> = Record<string, string>> = { params: Promise<P> };

const MAX_BODY_BYTES = 100_000;

/** Reads the body as JSON with a size cap, then validates with Zod. Malformed JSON => 400, never a 500. */
export async function parseBody<T>(req: Request, schema: ZodType<T, any, any>): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", 413, "Request body too large");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", 413, "Request body too large");
  let json: unknown = {};
  if (text.trim() !== "") {
    try { json = JSON.parse(text); } catch { throw new AppError("INVALID_JSON", 400, "Request body is not valid JSON"); }
  }
  return schema.parse(json);
}

export const queryOf = (req: Request) => Object.fromEntries(new URL(req.url).searchParams);

import { ZodError } from "zod";
import { AdminPrincipal, authenticateAdmin } from "@/lib/auth/admin";
import { can, permissionFor } from "@/lib/auth/rbac";
import { clientIp } from "@/lib/rateLimit";
import { recordAudit } from "@/services/audit.service";

const statusOf = (e: unknown) => (e instanceof AppError ? e.status : e instanceof ZodError ? 400 : 500);
const targetOf = (pathname: string) => /\/([a-f\d]{24})(?:\/|$)/i.exec(pathname)?.[1];

async function audited(req: Request, p: AdminPrincipal | null, run: () => Promise<NextResponse>): Promise<NextResponse> {
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const path = new URL(req.url).pathname;
  let status = 200;
  try {
    const res = await run();
    status = res.status;
    return res;
  } catch (e) {
    status = statusOf(e);
    throw e;
  } finally {
    if (mutating || status === 403) {
      await recordAudit({ actorType: p ? (p.via === "api-key" ? "api-key" : "admin") : "anonymous", actorId: p?.id, actorEmail: p?.email, role: p?.role, action: `${req.method} ${path.replace(/[a-f\d]{24}/gi, ":id")}`, path, targetId: targetOf(path), status, ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? undefined });
    }
  }
}

/**
 * Admin endpoint wrapper. Order: authenticate (API key or session) -> role permission (rbac.ts policy table) -> MFA gate ->
 * rate limit -> handler -> audit log for every write and every denial. Auth runs BEFORE any body parsing or DB work.
 */
export function admin<P extends Record<string, string> = Record<string, string>>(fn: (a: { req: Request; actor: AdminPrincipal; params: P }) => Promise<NextResponse>) {
  return async (req: Request, ctx: Ctx<P>): Promise<NextResponse> =>
    handle(async () => {
      const actor = await authenticateAdmin(req);
      return audited(req, actor, async () => {
        if (!can(actor.role, permissionFor(req.method, new URL(req.url).pathname))) throw new AppError("FORBIDDEN", 403, "Your role is not allowed to do this");
        if (actor.mfaSetupRequired) throw new AppError("MFA_SETUP_REQUIRED", 403, "Set up multi-factor authentication to continue");
        await enforceRateLimit(req, "admin", 300);
        return fn({ req, actor, params: (ctx?.params ? await ctx.params : {}) as P });
      });
    });
}

/** Authenticated admin of ANY role (profile, logout, MFA, own password). No permission check; MFA gate is not applied. */
export function adminSelf(fn: (a: { req: Request; actor: AdminPrincipal }) => Promise<NextResponse>) {
  return async (req: Request): Promise<NextResponse> =>
    handle(async () => {
      const actor = await authenticateAdmin(req);
      return audited(req, actor, async () => { await enforceRateLimit(req, "admin-self", 60); return fn({ req, actor }); });
    });
}

/** Customer endpoint wrapper: session required, CSRF-checked for cookie sessions, rate limited per IP. */
export function customer<P extends Record<string, string> = Record<string, string>>(fn: (a: { req: Request; me: CustomerSession; params: P }) => Promise<NextResponse>, opts: { limit?: number } = {}) {
  return async (req: Request, ctx: Ctx<P>): Promise<NextResponse> =>
    handle(async () => {
      const me = await requireCustomer(req);
      await enforceRateLimit(req, "customer", opts.limit ?? 120);
      return fn({ req, me, params: (ctx?.params ? await ctx.params : {}) as P });
    });
}

import { z } from "zod";
const oid = z.string().regex(/^[a-f\d]{24}$/i, "invalid id");
/** Validates a dynamic path segment as an ObjectId (400 on garbage, never reaching the database). */
export const idOf = (v: string | undefined): string => oid.parse(v);
