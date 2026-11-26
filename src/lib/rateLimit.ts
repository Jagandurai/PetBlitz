import { getEnv } from "@/lib/env";

/**
 * Rate limiting.
 *  - If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set: a SHARED fixed-window counter in Redis (REST API, no extra
 *    dependency), consistent across serverless instances.
 *  - Otherwise (local dev / not configured): per-process in-memory counters. Not shared across instances.
 *  - If Redis is configured but errors/timeouts, we FALL BACK to in-memory (fail-open to local limiting) and log once per failure.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export interface LimitResult { allowed: boolean; retryAfterSec: number; remaining: number }

export function memoryLimit(key: string, limit: number, windowMs: number, now = Date.now()): LimitResult {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0, remaining: limit - 1 };
  }
  b.count += 1;
  return { allowed: b.count <= limit, retryAfterSec: Math.ceil((b.resetAt - now) / 1000), remaining: Math.max(0, limit - b.count) };
}

async function redisLimit(url: string, token: string, key: string, limit: number, windowMs: number): Promise<LimitResult> {
  const windowId = Math.floor(Date.now() / windowMs);
  const k = `rl:${key}:${windowId}`;
  const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["INCR", k], ["PEXPIRE", k, String(windowMs), "NX"]]),
    signal: AbortSignal.timeout(1500),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = (await res.json()) as { result?: number; error?: string }[];
  const count = Number(out[0]?.result);
  if (!Number.isFinite(count)) throw new Error("bad redis response");
  const retryAfterSec = Math.max(1, Math.ceil(((windowId + 1) * windowMs - Date.now()) / 1000));
  return { allowed: count <= limit, retryAfterSec: count <= limit ? 0 : retryAfterSec, remaining: Math.max(0, limit - count) };
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<LimitResult> {
  const env = getEnvSafe();
  if (env?.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await redisLimit(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN, key, limit, windowMs);
    } catch (e) {
      console.error("[ratelimit] redis unavailable, using in-memory:", e instanceof Error ? e.message : "error");
    }
  }
  return memoryLimit(key, limit, windowMs);
}

function getEnvSafe() {
  try { return getEnv(); } catch { return null; } // env problems must not break rate limiting itself
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** test helper */
export function _resetMemoryLimits() { buckets.clear(); }
