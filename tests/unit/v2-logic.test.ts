import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SESSION_SECRET = "s".repeat(40);
process.env.CRON_SECRET = "c".repeat(40);

vi.mock("@/services/audit.service", () => ({ recordAudit: vi.fn(async () => undefined), listAuditLogs: vi.fn() }));
vi.mock("@/services/admin-auth.service", () => ({ authenticateSession: vi.fn() }));
vi.mock("@/services/order.service");
vi.mock("@/services/payment.service");

import { allocate, computeLine, computeOrderTotals, computeShipping, couponAmount } from "@/lib/pricing";
import { fiscalYear, splitGst, stateCodeOf } from "@/lib/gst";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hashRecovery, newRecoveryCodes, totpAt, verifyTotp } from "@/lib/auth/totp";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { can, permissionFor, ROLE_PERMISSIONS } from "@/lib/auth/rbac";
import { TEMPLATES } from "@/lib/email-templates";
import { withTextFallback } from "@/lib/search";
import { processOutbox } from "@/services/email.service";
import { authenticateSession } from "@/services/admin-auth.service";
import { recordAudit } from "@/services/audit.service";
import { resetEnvCache } from "@/lib/env";
import { _resetMemoryLimits } from "@/lib/rateLimit";

describe("pricing: GST inclusive vs exclusive", () => {
  it("exclusive: tax added on top; inclusive: tax is carved out of the price", () => {
    expect(computeLine({ unitPrice: 10000, unitDiscount: 0, quantity: 1, taxRateBps: 1800 })).toMatchObject({ taxAmount: 1800, lineTotal: 11800 });
    expect(computeLine({ unitPrice: 11800, unitDiscount: 0, quantity: 1, taxRateBps: 1800, inclusive: true })).toMatchObject({ taxAmount: 1800, lineTotal: 11800 });
  });
  it("tax is computed after discounts and coupon share (both modes)", () => {
    const ex = computeLine({ unitPrice: 10000, unitDiscount: 1000, quantity: 2, taxRateBps: 1800, extraDiscount: 2000 }); // gross 20000-2000-2000=16000
    expect(ex).toEqual({ subtotal: 20000, discountAmount: 4000, taxAmount: 2880, lineTotal: 18880 });
    const inc = computeLine({ unitPrice: 10000, unitDiscount: 1000, quantity: 2, taxRateBps: 1800, extraDiscount: 2000, inclusive: true });
    expect(inc.lineTotal).toBe(16000);
    expect(inc.taxAmount).toBe(16000 - Math.round((16000 * 10000) / 11800));
  });
  it("grand total = sum of line totals + shipping", () => {
    const l = [computeLine({ unitPrice: 5000, unitDiscount: 0, quantity: 3, taxRateBps: 500 }), computeLine({ unitPrice: 999, unitDiscount: 99, quantity: 1, taxRateBps: 1800, inclusive: true })];
    expect(computeOrderTotals(l, 4900).grandTotal).toBe(l[0]!.lineTotal + l[1]!.lineTotal + 4900);
  });
  it("rejects a discount larger than the line", () => expect(() => computeLine({ unitPrice: 100, unitDiscount: 0, quantity: 1, taxRateBps: 0, extraDiscount: 101 })).toThrow());
});

describe("coupons & shipping math", () => {
  it("allocate splits exactly, proportionally, never above a line's own value", () => {
    for (const [total, w] of [[100, [1, 1, 1]], [1, [5, 5]], [999, [333, 333, 333]], [50, [10, 0, 90]], [7, [3]]] as [number, number[]][]) {
      const a = allocate(total, w);
      expect(a.reduce((x, y) => x + y, 0)).toBe(Math.min(total, w.reduce((x, y) => x + y, 0)));
      a.forEach((v, i) => expect(v).toBeLessThanOrEqual(w[i]!));
    }
    expect(allocate(10, [0, 0])).toEqual([0, 0]);
  });
  it("percent/fixed, cap, minimum order", () => {
    expect(couponAmount({ type: "percent", value: 10, minOrderMinor: 0 }, 50000)).toBe(5000);
    expect(couponAmount({ type: "percent", value: 10, minOrderMinor: 0, maxDiscountMinor: 3000 }, 50000)).toBe(3000);
    expect(couponAmount({ type: "fixed", value: 99999, minOrderMinor: 0 }, 5000)).toBe(5000);
    expect(couponAmount({ type: "fixed", value: 500, minOrderMinor: 10000 }, 9999)).toBe(0);
  });
  it("shipping: state override, base fee, free above threshold", () => {
    const s = { baseFeeMinor: 6000, freeAboveMinor: 100000, stateFees: { "33": 4000 } };
    expect(computeShipping(s, 50000, "33")).toBe(4000);
    expect(computeShipping(s, 50000, "27")).toBe(6000);
    expect(computeShipping(s, 50000, undefined)).toBe(6000);
    expect(computeShipping(s, 100000, "27")).toBe(0);
    expect(computeShipping({ ...s, freeAboveMinor: null }, 9_999_999, "27")).toBe(6000);
  });
});

describe("GST helpers", () => {
  it("resolves state names/abbreviations/codes", () => {
    for (const v of ["Tamil Nadu", "tamilnadu", "TN", "33", " tamil  nadu "]) expect(stateCodeOf(v)).toBe("33");
    expect(stateCodeOf("Jammu & Kashmir")).toBe("01");
    expect(stateCodeOf("Atlantis")).toBeUndefined();
  });
  it("CGST+SGST within a state (halves sum exactly), IGST across states", () => {
    expect(splitGst(1801, "33", "33")).toEqual({ cgst: 900, sgst: 901, igst: 0 });
    expect(splitGst(1800, "33", "27")).toEqual({ cgst: 0, sgst: 0, igst: 1800 });
    expect(splitGst(1800, undefined, "27").igst).toBe(1800);
  });
  it("Indian financial year", () => {
    expect(fiscalYear(new Date("2026-03-31T00:00:00Z"))).toBe("2025-26");
    expect(fiscalYear(new Date("2026-04-01T00:00:00Z"))).toBe("2026-27");
    expect(fiscalYear(new Date("2099-12-31T00:00:00Z"))).toBe("2099-00");
  });
});

describe("TOTP (RFC 6238 test vectors) + secret encryption", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC SHA-1 vectors", () => {
    expect(totpAt(secret, 59_000, 8)).toBe("94287082");
    expect(totpAt(secret, 1_111_111_109_000, 8)).toBe("07081804");
    expect(totpAt(secret, 1_234_567_890_000, 8)).toBe("89005924");
    expect(totpAt(secret, 59_000)).toBe("287082");
  });
  it("verifies within +-1 step only, and rejects malformed codes", () => {
    const now = 1_700_000_000_000, code = totpAt(secret, now);
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(true);
    expect(verifyTotp(secret, code, now + 90_000)).toBe(false);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
  });
  it("base32 round-trips; secrets encrypt with a random IV and detect tampering", () => {
    expect(base32Decode(base32Encode(Buffer.from("hello!!")))).toEqual(Buffer.from("hello!!"));
    const a = encryptSecret("JBSWY3DPEHPK3PXP"), b = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("JBSWY3DPEHPK3PXP");
    const [iv, tag, enc] = a.split(".");
    expect(() => decryptSecret([iv, tag, Buffer.from("tampered").toString("base64")].join("."))).toThrow();
    expect(enc).toBeTruthy();
  });
  it("recovery codes are unique, hashable, case-insensitive", () => {
    const c = newRecoveryCodes();
    expect(new Set(c).size).toBe(8);
    expect(hashRecovery(c[0]!.toUpperCase())).toBe(hashRecovery(c[0]!));
  });
});

describe("passwords", () => {
  it("hash/verify round trip, salted, wrong password rejected", () => {
    const h = hashPassword("Correct-Horse-Battery-9");
    expect(verifyPassword("Correct-Horse-Battery-9", h)).toBe(true);
    expect(verifyPassword("Correct-Horse-Battery-8", h)).toBe(false);
    expect(hashPassword("Correct-Horse-Battery-9")).not.toBe(h);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
  it("policy", () => {
    expect(passwordProblem("short")).toMatch(/12/);
    expect(passwordProblem("alllowercaseletters")).toBeTruthy();
    expect(passwordProblem("Owner-Is-Here-2026", "owner@petblitz.in")).toMatch(/e-mail/);
    expect(passwordProblem("Tr0ub4dor&3-horse-Staple")).toBeNull();
  });
});

describe("RBAC policy", () => {
  it("maps routes to permissions; unknown admin paths are owner-only", () => {
    expect(permissionFor("GET", "/api/admin/orders")).toBe("orders.read");
    expect(permissionFor("POST", "/api/admin/orders/abc/refund")).toBe("finance.write");
    expect(permissionFor("POST", "/api/admin/orders/abc/status")).toBe("orders.write");
    expect(permissionFor("POST", "/api/admin/customers/abc/wallet/adjust")).toBe("finance.write");
    expect(permissionFor("GET", "/api/admin/customers/abc/wallet")).toBe("customers.read");
    expect(permissionFor("POST", "/api/admin/returns/abc/refund")).toBe("finance.write");
    expect(permissionFor("PATCH", "/api/admin/settings")).toBe("settings.write");
    expect(permissionFor("POST", "/api/admin/admins")).toBe("admins.manage");
    expect(permissionFor("GET", "/api/admin/something-new")).toBe("system");
  });
  it("roles are least-privilege", () => {
    expect(can("support", "finance.write")).toBe(false);
    expect(can("support", "support.write")).toBe(true);
    expect(can("catalog", "orders.write")).toBe(false);
    expect(can("orders", "finance.write")).toBe(false);
    expect(can("finance", "catalog.write")).toBe(false);
    for (const r of ["catalog", "orders", "finance", "support"] as const) { expect(can(r, "admins.manage")).toBe(false); expect(can(r, "settings.write")).toBe(false); expect(can(r, "system")).toBe(false); }
    expect(ROLE_PERMISSIONS.owner).toContain("admins.manage");
  });
});

describe("e-mail templates + outbox", () => {
  it("escape every interpolated value (no HTML injection)", () => {
    const m = TEMPLATES.orderPlaced!({ name: "<script>alert(1)</script>", orderNumber: "PB-1", total: 12345, orderId: "x\"onload=\"y" }, "https://petblitz.in");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).not.toContain('"onload="');
    expect(m.html).toContain("₹123.45");
  });
  it("processOutbox is a no-op (skipped) without SMTP configuration", async () => {
    delete process.env.SMTP_HOST;
    expect(await processOutbox()).toEqual({ sent: 0, failed: 0, skipped: true });
  });
});

describe("search fallback", () => {
  it("retries with an escaped regex when the text index is missing (code 27), rethrows other errors", async () => {
    const filter: Record<string, unknown> = { $text: { $search: "lab" } };
    const run = vi.fn().mockRejectedValueOnce(Object.assign(new Error("no index"), { code: 27 })).mockResolvedValueOnce("ok");
    expect(await withTextFallback(true, filter, "a.b", "$or", (r) => [{ name: r }], run)).toBe("ok");
    expect(filter.$text).toBeUndefined();
    expect(String(((filter.$or as { name: RegExp }[])[0]!).name)).toBe("/a\\.b/i");
    await expect(withTextFallback(true, {}, "x", "$or", () => [], vi.fn().mockRejectedValue(Object.assign(new Error("boom"), { code: 1 })))).rejects.toThrow("boom");
  });
});

describe("admin wrapper: roles, CSRF, MFA gate, audit", () => {
  const setPrincipal = (role: string, mfaEnabled = true) => vi.mocked(authenticateSession).mockResolvedValue({ id: "a".repeat(24), objectId: "a".repeat(24), email: "x@petblitz.in", role: role as never, mfaEnabled });
  const get = (path: string, headers: Record<string, string> = {}, method = "GET", body?: string) => new Request(`http://localhost:3000${path}`, { method, headers: { cookie: "pb_admin=sometoken", ...headers }, body });
  beforeEach(() => { vi.clearAllMocks(); _resetMemoryLimits(); resetEnvCache(); delete process.env.ADMIN_REQUIRE_MFA; process.env.ADMIN_API_KEY_ENABLED = "true"; });

  it("a support agent can read orders but a refund is 403 and the denial is audited", async () => {
    setPrincipal("support");
    const orders = await import("@/app/api/admin/orders/route");
    expect((await orders.GET(get("/api/admin/orders"), { params: Promise.resolve({}) })).status).toBe(200);
    const refund = await import("@/app/api/admin/orders/[id]/refund/route");
    const res = await refund.POST(get("/api/admin/orders/507f1f77bcf86cd799439011/refund", {}, "POST", "{}"), { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) });
    expect(res.status).toBe(403);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ status: 403, actorType: "admin", role: "support", action: "POST /api/admin/orders/:id/refund" }));
  });
  it("only owners reach admin management", async () => {
    const admins = await import("@/app/api/admin/admins/route");
    setPrincipal("finance");
    expect((await admins.GET(get("/api/admin/admins"), { params: Promise.resolve({}) })).status).toBe(403);
  });
  it("cookie writes need a same-origin Origin header (CSRF); reads do not", async () => {
    setPrincipal("owner");
    const status = await import("@/app/api/admin/orders/[id]/status/route");
    const ctx = { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) };
    const evil = await status.POST(get("/api/admin/orders/507f1f77bcf86cd799439011/status", { origin: "https://evil.example", "content-type": "application/json" }, "POST", '{"status":"accepted"}'), ctx);
    expect(evil.status).toBe(403);
    expect((await evil.json()).error.code).toBe("CSRF_BLOCKED");
  });
  it("with ADMIN_REQUIRE_MFA a session without MFA is blocked everywhere except the self-service routes", async () => {
    process.env.ADMIN_REQUIRE_MFA = "true"; resetEnvCache();
    setPrincipal("owner", false);
    const orders = await import("@/app/api/admin/orders/route");
    const blocked = await orders.GET(get("/api/admin/orders"), { params: Promise.resolve({}) });
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.code).toBe("MFA_SETUP_REQUIRED");
    const me = await import("@/app/api/admin/auth/me/route");
    const res = await me.GET(get("/api/admin/auth/me"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.mfaSetupRequired).toBe(true);
  });
  it("expired/unknown sessions are 401; the API key can be switched off", async () => {
    vi.mocked(authenticateSession).mockResolvedValue(null);
    const orders = await import("@/app/api/admin/orders/route");
    expect((await orders.GET(get("/api/admin/orders"), { params: Promise.resolve({}) })).status).toBe(401);
    process.env.ADMIN_API_KEY = "k".repeat(40); process.env.ADMIN_API_KEY_ENABLED = "false"; resetEnvCache();
    const viaKey = await orders.GET(new Request("http://localhost:3000/api/admin/orders", { headers: { authorization: `Bearer ${"k".repeat(40)}` } }), { params: Promise.resolve({}) });
    expect(viaKey.status).toBe(401);
  });
  it("successful admin writes are audited with the real actor and no request body", async () => {
    resetEnvCache(); process.env.ADMIN_API_KEY_ENABLED = "true"; process.env.ADMIN_API_KEY = "k".repeat(40);
    const note = await import("@/app/api/admin/orders/[id]/note/route");
    const res = await note.PATCH(new Request("http://localhost:3000/api/admin/orders/507f1f77bcf86cd799439011/note", { method: "PATCH", headers: { authorization: `Bearer ${"k".repeat(40)}`, "content-type": "application/json" }, body: JSON.stringify({ adminNote: "SECRET-NOTE" }) }), { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) });
    expect(res.status).toBe(200);
    const entry = vi.mocked(recordAudit).mock.calls.at(-1)![0];
    expect(entry).toMatchObject({ actorType: "api-key", status: 200, targetId: "507f1f77bcf86cd799439011" });
    expect(JSON.stringify(entry)).not.toContain("SECRET-NOTE");
  });
});
