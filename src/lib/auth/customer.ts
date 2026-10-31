import { connectDB } from "@/lib/db/connection";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { Customer } from "@/models/Customer";
import { SESSION_COOKIE, verifySession } from "./session";

export interface CustomerSession { customerId: string; viaCookie: boolean }
export type CustomerAuthResolver = (req: Request) => Promise<{ customerId: string } | null>;

/**
 * INTEGRATION POINT. By default sessions are the signed token from session.ts (cookie `pb_session` or `Authorization: Bearer`).
 * To use Auth.js / another provider later, call setCustomerAuthResolver(async (req) => ({ customerId })) once at startup;
 * everything downstream (ownership checks, services) is unchanged because services always receive an explicit customerId.
 */
let customResolver: CustomerAuthResolver | null = null;
export const setCustomerAuthResolver = (r: CustomerAuthResolver | null) => { customResolver = r; };

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** CSRF defence for cookie-authenticated, state-changing requests: the Origin header must match our app origin. */
export function assertSameOrigin(req: Request) {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  const allowed = getEnv().APP_ORIGIN ?? (process.env.NODE_ENV === "production" ? null : new URL(req.url).origin);
  if (!allowed) throw new AppError("CSRF_BLOCKED", 403, "APP_ORIGIN is not configured");
  if (!origin) {
    if (process.env.NODE_ENV === "production") throw new AppError("CSRF_BLOCKED", 403, "Origin header required");
    return; // dev tools (Thunder Client, curl) do not send Origin
  }
  if (origin !== allowed) throw new AppError("CSRF_BLOCKED", 403, "Cross-origin request blocked");
}

export async function requireCustomer(req: Request): Promise<CustomerSession> {
  let customerId: string | null = null;
  let viaCookie = false;

  if (customResolver) {
    customerId = (await customResolver(req))?.customerId ?? null;
  } else {
    const bearer = req.headers.get("authorization");
    const token = bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : null;
    const cookie = token ? null : readCookie(req, SESSION_COOKIE);
    const raw = token ?? cookie;
    if (raw) {
      customerId = verifySession(raw)?.customerId ?? null;
      viaCookie = !token;
    }
  }
  if (!customerId) throw new AppError("UNAUTHENTICATED", 401, "Sign in required");
  if (viaCookie) assertSameOrigin(req);

  await connectDB();
  // Re-check on every request so suspension/deletion takes effect immediately.
  const c = await Customer.findOne({ _id: customerId }, { status: 1 }).lean();
  if (!c || c.status === "deleted") throw new AppError("UNAUTHENTICATED", 401, "Sign in required");
  if (c.status === "suspended") throw new AppError("ACCOUNT_SUSPENDED", 403, "Account suspended");
  return { customerId, viaCookie };
}
