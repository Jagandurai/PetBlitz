
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENDPOINTS, routePattern } from "../../scripts/endpoints";
import { AppError } from "@/lib/errors";
import { _resetMemoryLimits } from "@/lib/rateLimit";
import { resetEnvCache } from "@/lib/env";

process.env.CRON_SECRET = "cron-secret-cron-secret-cron-secret-123";
process.env.CLOUDINARY_CLOUD_NAME = "democloud";
process.env.CLOUDINARY_API_KEY = "123456";
process.env.CLOUDINARY_API_SECRET = "cloud-secret";

// Services are mocked: these tests verify the HTTP layer (auth, validation, status codes, response shape) for EVERY route.
vi.mock("@/services/category.service");
vi.mock("@/services/pet.service");
vi.mock("@/services/product.service");
vi.mock("@/services/order.service");
vi.mock("@/services/payment.service");
vi.mock("@/services/wallet.service");
vi.mock("@/services/customer.service");
vi.mock("@/services/review.service");
vi.mock("@/services/message.service");
vi.mock("@/services/maintenance.service");
vi.mock("@/services/audit.service");
vi.mock("@/services/cart.service");
vi.mock("@/services/return.service");
vi.mock("@/services/privacy.service");
vi.mock("@/services/dashboard.service");
vi.mock("@/services/coupon.service");
vi.mock("@/services/invoice.service");
vi.mock("@/services/settings.service");
vi.mock("@/services/admin-auth.service");
vi.mock("@/services/email.service"); // admin writes are audited; no DB in these tests
vi.mock("@/lib/auth/customer", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/customer")>();
  return {
    ...real,
    requireCustomer: vi.fn(async (req: Request) => {
      if (!req.headers.get("x-test-customer")) {
        throw new AppError("UNAUTHENTICATED", 401, "Sign in required");
      }
      return { customerId: "507f1f77bcf86cd799439011", viaCookie: false };
    }),
  };
});

import * as Cat from "@/services/category.service";
import * as Ord from "@/services/order.service";
import * as Cust from "@/services/customer.service";
import * as Msg from "@/services/message.service";
import * as Maint from "@/services/maintenance.service";
import * as Pay from "@/services/payment.service";
import * as Pet from "@/services/pet.service";
import * as Prod from "@/services/product.service";
import * as Rev from "@/services/review.service";
import * as Wal from "@/services/wallet.service";
import * as CartS from "@/services/cart.service";
import * as RetS from "@/services/return.service";
import * as PrivS from "@/services/privacy.service";
import * as DashS from "@/services/dashboard.service";
import * as CoupS from "@/services/coupon.service";
import * as InvS from "@/services/invoice.service";
import * as SetS from "@/services/settings.service";
import * as AAuth from "@/services/admin-auth.service";
import * as EmailS from "@/services/email.service";

const ALL_SERVICE_MOCKS = [Cat, Ord, Cust, Msg, Maint, Pay, Pet, Prod, Rev, Wal, CartS, RetS, PrivS, DashS, CoupS, InvS, SetS, AAuth, EmailS];

const serviceCalls = () =>
  ALL_SERVICE_MOCKS
    .flatMap((m) => Object.values(m))
    .filter((f) => typeof f === "function" && "mock" in f)
    .reduce(
      (n, f) => n + (f as ReturnType<typeof vi.fn>).mock.calls.length,
      0,
    );

const ADMIN = process.env.ADMIN_API_KEY!;
const OID = "507f1f77bcf86cd799439011";

const routes = import.meta.glob("/src/app/api/**/route.ts") as Record<
  string,
  () => Promise<
    Record<string, (req: Request, ctx?: unknown) => Promise<Response>>
  >
>;

const subst = (v: unknown, id = OID): unknown => {
  if (typeof v === "string") {
    return v.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
      name.endsWith("Slug") ? "some-slug" : id,
    );
  }
  if (Array.isArray(v)) return v.map((x) => subst(x, id));
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, subst(x, id)]),
    );
  }
  return v;
};

async function call(
  e: (typeof ENDPOINTS)[number],
  opts: {
    auth?: "ok" | "none" | "wrong";
    body?: unknown;
    query?: string;
    idValue?: string;
  } = {},
) {
  const pattern = routePattern(e.path);
  const file = `/src/app${pattern}/route.ts`;
  const loader = routes[file];

  if (!loader) {
    throw new Error(`no route file for ${e.method} ${e.path} (${file})`);
  }

  const mod = await loader();
  const handler = mod[e.method];

  if (!handler) {
    throw new Error(`route ${file} does not export ${e.method}`);
  }

  const idValue = opts.idValue ?? OID;
  const path = subst(e.path, idValue) as string;
  const query = opts.query ?? (e.query ? (subst(e.query) as string) : "");
  const headers: Record<string, string> = {};

  if (opts.auth !== "none") {
    if (e.auth === "admin") {
      headers.authorization = `Bearer ${
        opts.auth === "wrong" ? "wrong-key" : ADMIN
      }`;
    }
    if (e.auth === "customer") headers["x-test-customer"] = "1";
    if (e.auth === "cron") {
      headers.authorization = `Bearer ${
        opts.auth === "wrong" ? "wrong" : process.env.CRON_SECRET
      }`;
    }
  }

  const bodyObj = opts.body !== undefined ? opts.body : e.body;
  let init: RequestInit = { method: e.method, headers };

  if (bodyObj !== undefined && e.method !== "GET") {
    headers["content-type"] = "application/json";
    init = { ...init, body: JSON.stringify(subst(bodyObj)) };
  }

  const req = new Request(
    `http://localhost:3000${path}${query ? "?" + query : ""}`,
    init,
  );

  const params: Record<string, string> = {};
  for (const m of pattern.matchAll(/\[(\w+)\]/g)) {
    params[m[1]!] =
      m[1] === "slug" ? (opts.idValue ?? "some-slug") : idValue;
  }

  const res = await handler(req, { params: Promise.resolve(params) });

  return {
    status: res.status,
    json: (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: { code: string };
    } | null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Keep route tests isolated from shared Upstash Redis counters.
  // Blank values are treated as undefined by getEnv().
  process.env.UPSTASH_REDIS_REST_URL = "";
  process.env.UPSTASH_REDIS_REST_TOKEN = "";
  resetEnvCache();
  _resetMemoryLimits();

  vi.mocked(Cat.getCategoryBySlug).mockResolvedValue({
    category: { id: OID } as never,
    canonicalSlug: "x",
    redirected: false,
  });
  vi.mocked(Cat.getCategoryChildren).mockResolvedValue([]);
  vi.mocked(Cat.getCategoryAncestors).mockResolvedValue([]);
  vi.mocked(Ord.createOrder).mockResolvedValue({
    order: {} as never,
    duplicate: false,
  });
  vi.mocked(Cust.getOwnProfile).mockResolvedValue({ addresses: [] } as never);
  vi.mocked(Cust.addAddress).mockResolvedValue(OID);
  vi.mocked(Msg.createPublicTicket).mockResolvedValue({
    ticketNumber: "TKT-000001",
  });
  vi.mocked(Maint.runMaintenance).mockResolvedValue({
    ordersCancelled: 0,
    petReservationsReleased: 0,
    walletRefundsFinalised: 0, email: { sent: 0, failed: 0, skipped: true },
  });
  vi.mocked(Msg.assignTicket).mockResolvedValue(undefined);
  vi.mocked(CartS.checkoutCart).mockResolvedValue({ order: {} as never, duplicate: false });
  vi.mocked(PrivS.deleteMyAccount).mockResolvedValue({ anonymized: true });
  vi.mocked(AAuth.createAdmin).mockResolvedValue({} as never);
});

const tableCases = ENDPOINTS.filter((e) => e.auth !== "webhook");

describe("route completeness", () => {
  it("every route file/method is documented in scripts/endpoints.ts and vice-versa", async () => {
    const actual = new Set<string>();

    for (const [file, loader] of Object.entries(routes)) {
      const pattern = file.replace("/src/app", "").replace("/route.ts", "");

      for (const m of Object.keys(await loader())) {
        if (["GET", "POST", "PATCH", "PUT", "DELETE"].includes(m)) {
          actual.add(`${m} ${pattern}`);
        }
      }
    }

    const documented = new Set(
      ENDPOINTS.map((e) => `${e.method} ${routePattern(e.path)}`),
    );

    expect([...actual].filter((x) => !documented.has(x))).toEqual([]);
    expect([...documented].filter((x) => !actual.has(x))).toEqual([]);
  });
});

describe("authentication & authorization (every protected route)", () => {
  for (const e of tableCases.filter((x) => x.auth !== "public")) {
    it(`${e.method} ${e.path}: rejects missing credentials (401) without touching services`, async () => {
      const r = await call(e, { auth: "none" });

      expect(r.status).toBe(401);
      expect(r.json?.success).toBe(false);
      expect(serviceCalls()).toBe(0);
    });

    if (e.auth === "admin" || e.auth === "cron") {
      it(`${e.method} ${e.path}: rejects a wrong key (401)`, async () => {
        const r = await call(e, { auth: "wrong" });

        expect(r.status).toBe(401);
        expect(serviceCalls()).toBe(0);
      });
    }
  }
});

describe("input validation (every route with a schema)", () => {
  for (const e of tableCases.filter((x) => x.invalidBody !== undefined)) {
    it(`${e.method} ${e.path}: invalid body -> 400 and no service call`, async () => {
      const r = await call(e, { body: e.invalidBody });

      expect(r.status).toBe(400);
      expect(r.json?.error?.code).toMatch(/VALIDATION_ERROR|INVALID_JSON/);
      expect(serviceCalls()).toBe(0);
    });
  }

  for (const e of tableCases.filter((x) => x.invalidQuery)) {
    it(`${e.method} ${e.path}?${e.invalidQuery}: invalid query -> 400`, async () => {
      const r = await call(e, { query: e.invalidQuery });

      expect(r.status).toBe(400);
      expect(serviceCalls()).toBe(0);
    });
  }

  for (const e of tableCases.filter(
    (x) =>
      /\{\{(?!\w*Slug)\w+\}\}/.test(x.path) &&
      (x.auth === "admin" || x.auth === "customer"),
  )) {
    it(`${e.method} ${e.path}: malformed id -> 400 before any service call`, async () => {
      const r = await call(e, { idValue: "not-an-id" });

      expect(r.status).toBe(400);
      expect(serviceCalls()).toBe(0);
    });
  }

  it("malformed JSON -> 400 INVALID_JSON", async () => {
    const e = ENDPOINTS.find(
      (x) => x.path === "/api/admin/categories" && x.method === "POST",
    )!;
    const mod = await routes["/src/app/api/admin/categories/route.ts"]!();
    const res = await mod.POST!(
      new Request("http://x/api/admin/categories", {
        method: "POST",
        headers: { authorization: `Bearer ${ADMIN}` },
        body: "{not json",
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
    expect(e).toBeTruthy();
  });

  it("oversized body -> 413", async () => {
    const mod = await routes["/src/app/api/admin/categories/route.ts"]!();
    const res = await mod.POST!(
      new Request("http://x/api/admin/categories", {
        method: "POST",
        headers: { authorization: `Bearer ${ADMIN}` },
        body: JSON.stringify({ name: "x".repeat(150_000), type: "dog" }),
      }),
    );

    expect(res.status).toBe(413);
  });
});

describe("successful requests (services mocked)", () => {
  for (const e of tableCases.filter((x) => !x.skipValid)) {
    it(`${e.method} ${e.path}${e.query ? "?" + e.query : ""} -> ${e.expect ?? 200}`, async () => {
      const r = await call(e);

      expect(r.status).toBe(e.expect ?? 200);
      expect(r.json?.success).toBe(true);

      if (!["/api/health", "/api/admin/media/sign", "/api/admin/auth/me", "/api/admin/auth/logout", "/api/admin/audit-logs"].includes(e.path)) {
        expect(serviceCalls()).toBeGreaterThan(0);
      }
    });
  }
});

describe("route-specific behaviour", () => {
  it("contact form: honeypot gets a fake 202 and NOTHING is stored", async () => {
    const e = ENDPOINTS.find((x) => x.path === "/api/contact")!;
    const r = await call(e, {
      body: { ...(e.body as object), website: "http://spam.example" },
    });

    expect(r.status).toBe(202);
    expect(Msg.createPublicTicket).not.toHaveBeenCalled();
  });

  it("contact form: 6th request in the window is rate limited (429)", async () => {
    const e = ENDPOINTS.find((x) => x.path === "/api/contact")!;
    const codes: number[] = [];

    for (let i = 0; i < 6; i++) codes.push((await call(e)).status);

    expect(codes.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(codes[5]).toBe(429);
  });

  it("order status endpoint refuses 'cancelled' (use the cancel endpoint)", async () => {
    const e = ENDPOINTS.find(
      (x) => x.path.endsWith("/status") && x.path.includes("/orders/"),
    )!;

    expect((await call(e, { body: { status: "cancelled" } })).status).toBe(400);
  });

  it("replayed checkout (duplicate idempotency key) returns 200 not 201", async () => {
    vi.mocked(Ord.createOrder).mockResolvedValue({
      order: {} as never,
      duplicate: true,
    });

    const e = ENDPOINTS.find(
      (x) => x.method === "POST" && x.path === "/api/me/orders",
    )!;

    expect((await call(e)).status).toBe(200);
  });

  it("admin cancel & refund routes delegate to payment service with the admin actor", async () => {
    const cancel = ENDPOINTS.find(
      (x) => x.path.endsWith("/cancel") && x.path.includes("/admin/"),
    )!;

    await call(cancel);

    expect(Pay.cancelOrderWithRefund).toHaveBeenCalledWith(
      OID,
      { type: "admin", id: "admin-api-key" },
      "Out of stock",
    );
  });

  it("admin responses never contain the admin key", async () => {
    const e = ENDPOINTS.find(
      (x) => x.path === "/api/admin/categories" && x.method === "GET",
    )!;
    const mod = await routes["/src/app/api/admin/categories/route.ts"]!();
    const res = await mod.GET!(
      new Request("http://x/api/admin/categories?flat=maybe", {
        headers: { authorization: `Bearer ${ADMIN}` },
      }),
    );

    expect(JSON.stringify(await res.json())).not.toContain(ADMIN);
    expect(e).toBeTruthy();
  });
});