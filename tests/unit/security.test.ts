import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SESSION_SECRET = "s".repeat(40);
process.env.CRON_SECRET = "c".repeat(40);
process.env.GOOGLE_CLIENT_ID = "client-id";
process.env.CLOUDINARY_CLOUD_NAME = "demo";
process.env.CLOUDINARY_API_KEY = "key123";
process.env.CLOUDINARY_API_SECRET = "secret456";

const customerDoc: { v: { status: string } | null } = { v: { status: "active" } };
vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn(async () => undefined) }));
vi.mock("@/models/Customer", () => ({ Customer: { findOne: vi.fn(() => ({ lean: async () => customerDoc.v })) } }));
vi.mock("@/lib/auth/google", () => ({ verifyGoogleIdToken: vi.fn() }));
vi.mock("@/services/customer.service", () => ({ upsertCustomerFromGoogle: vi.fn(), toCustomerProfile: vi.fn((c: unknown) => ({ id: "x", c })) }));

import { SESSION_COOKIE, signSession, verifySession, sessionCookie } from "@/lib/auth/session";
import { assertSameOrigin, requireCustomer, setCustomerAuthResolver } from "@/lib/auth/customer";
import { requireAdmin, requireCron } from "@/lib/auth/guards";
import { memoryLimit, rateLimit, _resetMemoryLimits } from "@/lib/rateLimit";
import { createCloudinaryUploadSignature } from "@/lib/storage";
import { parseBody } from "@/lib/route";
import { verifyGoogleIdToken } from "@/lib/auth/google";
import { upsertCustomerFromGoogle } from "@/services/customer.service";
import { z } from "zod";

const OID = "507f1f77bcf86cd799439011";
const req = (headers: Record<string, string> = {}, method = "GET") => new Request("http://localhost:3000/api/me", { method, headers });

describe("session tokens", () => {
  it("round-trips, rejects tampering, wrong secret shape, expiry and junk", () => {
    const t = signSession(OID);
    expect(verifySession(t)).toEqual({ customerId: OID });
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "aaaaaaaaaaaaaaaaaaaaaaaa", iat: 1, exp: 9_999_999_999, v: 1 })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`)).toBeNull();
    expect(verifySession(`${body}.AAAA`)).toBeNull();
    expect(verifySession("garbage")).toBeNull();
    expect(verifySession(`${t}.extra`)).toBeNull();
    expect(verifySession(signSession(OID, 1, Date.now() - 2 * 3600_000))).toBeNull(); // expired
  });
  it("cookie is HttpOnly + SameSite=Lax", () => {
    const c = sessionCookie("tok");
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c.startsWith(`${SESSION_COOKIE}=tok`)).toBe(true);
  });
});

describe("requireCustomer (ownership/session integration point)", () => {
  beforeEach(() => { customerDoc.v = { status: "active" }; setCustomerAuthResolver(null); });
  it("401 when no credentials / bad token", async () => {
    await expect(requireCustomer(req())).rejects.toMatchObject({ status: 401 });
    await expect(requireCustomer(req({ authorization: "Bearer nope" }))).rejects.toMatchObject({ status: 401 });
  });
  it("accepts a valid bearer token (no CSRF needed) and a valid cookie on GET", async () => {
    const t = signSession(OID);
    expect(await requireCustomer(req({ authorization: `Bearer ${t}` }, "POST"))).toEqual({ customerId: OID, viaCookie: false });
    expect(await requireCustomer(req({ cookie: `${SESSION_COOKIE}=${t}` }))).toEqual({ customerId: OID, viaCookie: true });
  });
  it("CSRF: cookie-authenticated POST from another origin is blocked; same origin allowed", async () => {
    const t = signSession(OID);
    await expect(requireCustomer(req({ cookie: `${SESSION_COOKIE}=${t}`, origin: "https://evil.example" }, "POST"))).rejects.toMatchObject({ status: 403, code: "CSRF_BLOCKED" });
    await expect(requireCustomer(req({ cookie: `${SESSION_COOKIE}=${t}`, origin: "http://localhost:3000" }, "POST"))).resolves.toBeTruthy();
    expect(() => assertSameOrigin(req({ origin: "https://evil.example" }, "DELETE"))).toThrow();
  });
  it("suspended -> 403, deleted/missing -> 401 (takes effect immediately)", async () => {
    const t = signSession(OID);
    customerDoc.v = { status: "suspended" };
    await expect(requireCustomer(req({ authorization: `Bearer ${t}` }))).rejects.toMatchObject({ status: 403 });
    customerDoc.v = { status: "deleted" };
    await expect(requireCustomer(req({ authorization: `Bearer ${t}` }))).rejects.toMatchObject({ status: 401 });
    customerDoc.v = null;
    await expect(requireCustomer(req({ authorization: `Bearer ${t}` }))).rejects.toMatchObject({ status: 401 });
  });
  it("custom resolver (Auth.js hook) replaces the default", async () => {
    setCustomerAuthResolver(async () => ({ customerId: OID }));
    expect(await requireCustomer(req())).toEqual({ customerId: OID, viaCookie: false });
    setCustomerAuthResolver(null);
  });
});

describe("admin & cron guards", () => {
  it("admin identity has a stable ObjectId for audit columns", () => {
    const a = requireAdmin(req({ authorization: `Bearer ${process.env.ADMIN_API_KEY}` }));
    expect(a.objectId).toMatch(/^[a-f\d]{24}$/);
    expect(requireAdmin(req({ authorization: `Bearer ${process.env.ADMIN_API_KEY}` })).objectId).toBe(a.objectId);
  });
  it("cron secret is separate from the admin key", () => {
    expect(() => requireCron(req({ authorization: `Bearer ${process.env.ADMIN_API_KEY}` }))).toThrow();
    expect(() => requireCron(req({ authorization: `Bearer ${"c".repeat(40)}` }))).not.toThrow();
    expect(() => requireAdmin(req({ authorization: `Bearer ${"c".repeat(40)}` }))).toThrow();
  });
});

describe("rate limiter", () => {
  beforeEach(() => { _resetMemoryLimits(); vi.restoreAllMocks(); delete process.env.UPSTASH_REDIS_REST_URL; });
  it("in-memory fixed window", () => {
    expect([1, 2, 3].map(() => memoryLimit("k", 2, 1000, 0).allowed)).toEqual([true, true, false]);
    expect(memoryLimit("k", 2, 1000, 5000).allowed).toBe(true); // new window
  });
  it("uses Redis REST when configured, and falls back to memory when Redis fails", async () => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ result: 99 }, { result: 0 }]), { status: 200 }))
      .mockRejectedValueOnce(new Error("boom"));
    vi.stubGlobal("fetch", fetchMock);
    const { resetEnvCache } = await import("@/lib/env");
    resetEnvCache();
    const rl = await import("@/lib/rateLimit");
    expect((await rl.rateLimit("a", 5, 60_000)).allowed).toBe(true);
    const blocked = await rl.rateLimit("a", 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect((await rl.rateLimit("b", 5, 60_000)).allowed).toBe(true); // redis threw -> memory fallback, still functional
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe("Bearer tok");
    vi.unstubAllGlobals();
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetEnvCache();
    expect(rateLimit).toBeTypeOf("function");
  });
});

describe("media upload signature", () => {
  it("matches Cloudinary's documented SHA-1 scheme and never exposes the secret", () => {
    const r = createCloudinaryUploadSignature("pets", 1_700_000_000_000);
    const expected = crypto.createHash("sha1").update("allowed_formats=jpg,jpeg,png,webp&folder=petblitz/pets&timestamp=1700000000" + "secret456").digest("hex");
    expect(r.fields.signature).toBe(expected);
    expect(r.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(JSON.stringify(r)).not.toContain("secret456");
  });
});

describe("parseBody", () => {
  it("empty body is treated as {} (for body-less POSTs with optional fields)", async () => {
    expect(await parseBody(new Request("http://x", { method: "POST" }), z.object({ a: z.string().optional() }).strict())).toEqual({});
  });
});

describe("POST /api/auth/google", () => {
  beforeEach(() => { _resetMemoryLimits(); vi.clearAllMocks(); });
  it("sets an HttpOnly session cookie after Google verification; rejects bad tokens; blocks cross-origin", async () => {
    const { POST } = await import("@/app/api/auth/google/route");
    vi.mocked(verifyGoogleIdToken).mockResolvedValue({ sub: "g1", email: "a@x.com", email_verified: true });
    vi.mocked(upsertCustomerFromGoogle).mockResolvedValue({ customer: { _id: OID } as never, created: true });
    const mk = (body: unknown, headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/auth/google", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    const ok = await POST(mk({ idToken: "x".repeat(40) }));
    expect(ok.status).toBe(201);
    expect(ok.headers.get("set-cookie")).toMatch(/pb_session=.+HttpOnly/);
    expect(verifySession(/pb_session=([^;]+)/.exec(ok.headers.get("set-cookie")!)![1]!)).toEqual({ customerId: OID });
    expect((await POST(mk({ idToken: "short" }))).status).toBe(400);
    expect((await POST(mk({ idToken: "x".repeat(40) }, { origin: "https://evil.example" }))).status).toBe(403);
    const { AppError } = await import("@/lib/errors");
    vi.mocked(verifyGoogleIdToken).mockRejectedValue(new AppError("INVALID_ID_TOKEN", 401, "Invalid Google credential"));
    expect((await POST(mk({ idToken: "y".repeat(40) }))).status).toBe(401);
  });
});
