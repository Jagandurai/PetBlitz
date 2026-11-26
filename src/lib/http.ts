import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { clientIp, rateLimit } from "./rateLimit";

export const ok = <T>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });

export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ success: false, error: { code, message, ...(details ? { details } : {}) } }, { status });
}

/** Consistent error mapping. Never returns stack traces, secrets or database internals. */
export function toErrorResponse(e: unknown) {
  if (e instanceof ZodError) {
    return fail(400, "VALIDATION_ERROR", "Invalid request", e.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  if (e instanceof AppError) {
    return fail(e.status, e.code, e.message, e.code === "CONFIG_ERROR" ? undefined : e.details);
  }
  console.error("[unhandled]", e instanceof Error ? e.name : "UnknownError");
  return fail(500, "INTERNAL_ERROR", "Something went wrong");
}

export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function enforceRateLimit(req: Request, scope: string, limit = 60, windowMs = 60_000) {
  const r = await rateLimit(`${scope}:${clientIp(req)}`, limit, windowMs);
  if (!r.allowed) throw new AppError("RATE_LIMITED", 429, "Too many requests", { retryAfterSec: r.retryAfterSec });
}
