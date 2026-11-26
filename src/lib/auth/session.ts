import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Minimal signed session token (HMAC-SHA256, expiry). Format: base64url(payload).base64url(hmac).
 * Not a replacement for Auth.js; it is the smallest safe building block that lets the Google ID-token login route and
 * the ownership checks work. The auth layer can be swapped via setCustomerAuthResolver() (see customer.ts).
 */
export const SESSION_COOKIE = "pb_session";
interface Payload { sub: string; iat: number; exp: number; v: 1 }

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function secret(): string {
  const s = getEnv().SESSION_SECRET;
  if (!s) throw new AppError("AUTH_NOT_CONFIGURED", 503, "Customer authentication is not configured");
  return s;
}
const mac = (data: string, key: string) => createHmac("sha256", key).update(data).digest();

export function signSession(customerId: string, ttlHours = getEnv().SESSION_TTL_HOURS, now = Date.now()): string {
  const payload: Payload = { sub: customerId, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + ttlHours * 3600, v: 1 };
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(mac(body, secret()))}`;
}

export function verifySession(token: string, now = Date.now()): { customerId: string } | null {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = mac(body, secret());
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    if (p.v !== 1 || typeof p.sub !== "string" || !/^[a-f\d]{24}$/i.test(p.sub) || p.exp * 1000 <= now) return null;
    return { customerId: p.sub };
  } catch { return null; }
}

export function sessionCookie(token: string, ttlHours = getEnv().SESSION_TTL_HOURS): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttlHours * 3600}${secure}`;
}
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
