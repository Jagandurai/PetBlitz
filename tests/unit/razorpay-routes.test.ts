import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, notFound } from "@/lib/errors";
import * as Pay from "@/services/payment.service";

vi.mock("@/services/payment.service");
vi.mock("@/lib/auth/customer", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/customer")>();
  return {
    ...real,
    requireCustomer: vi.fn(async () => ({ customerId: "507f1f77bcf86cd799439011", viaCookie: false })),
  };
});

import * as RazorpayWebhookRoute from "@/app/api/webhooks/razorpay/route";
import * as RazorpayConfirmRoute from "@/app/api/me/payments/razorpay/confirm/route";

// customer() route handlers take a Next.js route context; these routes have no dynamic segments.
const confirmPost = (req: Request) => RazorpayConfirmRoute.POST(req, { params: Promise.resolve({}) });

const signWebhook = (body: string) =>
  crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET ?? "whsec_rzp_test").update(body).digest("hex");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RAZORPAY_WEBHOOK_SECRET ??= "whsec_rzp_test";
  process.env.RAZORPAY_KEY_SECRET ??= "test_key_secret";
});

describe("razorpay webhook route", () => {
  it("rejects missing event-id before touching the payment processor", async () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    const res = await RazorpayWebhookRoute.POST(
      new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: { "x-razorpay-signature": signWebhook(body) },
        body,
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_EVENT");
    expect(Pay.processRazorpayEvent).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures without processing the event", async () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    const res = await RazorpayWebhookRoute.POST(
      new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: { "x-razorpay-signature": "deadbeef", "x-razorpay-event-id": "evt_bad_sig" },
        body,
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_SIGNATURE");
    expect(Pay.processRazorpayEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON payloads before service processing", async () => {
    const bad = "{not-json";
    const res = await RazorpayWebhookRoute.POST(
      new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": signWebhook(bad),
          "x-razorpay-event-id": "evt_malformed",
        },
        body: bad,
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_EVENT");
    expect(Pay.processRazorpayEvent).not.toHaveBeenCalled();
  });

  it("accepts a valid event and preserves duplicate-delivery handling in the response", async () => {
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_123" } } } });
    vi.mocked(Pay.processRazorpayEvent).mockResolvedValue({ handled: true });

    const first = await RazorpayWebhookRoute.POST(
      new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": signWebhook(body),
          "x-razorpay-event-id": "evt_ok",
        },
        body,
      }),
    );

    expect(first.status).toBe(200);
    expect((await first.json()).data).toMatchObject({ received: true, handled: true });
    expect(Pay.processRazorpayEvent).toHaveBeenCalledWith("evt_ok", {
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_123" } } },
    });

    vi.mocked(Pay.processRazorpayEvent).mockResolvedValue({ handled: true, duplicate: true });
    const second = await RazorpayWebhookRoute.POST(
      new Request("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": signWebhook(body),
          "x-razorpay-event-id": "evt_dup",
        },
        body,
      }),
    );

    expect(second.status).toBe(200);
    expect((await second.json()).data).toMatchObject({ received: true, handled: true, duplicate: true });
  });
});

describe("razorpay checkout confirm route", () => {
  it("rejects malformed JSON before the checkout service is called", async () => {
    const res = await confirmPost(
      new Request("http://localhost:3000/api/me/payments/razorpay/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
    expect(Pay.confirmRazorpayCheckout).not.toHaveBeenCalled();
  });

  it("returns the service's failure for incorrect order or payment references", async () => {
    vi.mocked(Pay.confirmRazorpayCheckout).mockRejectedValue(notFound("Payment"));
    const body = JSON.stringify({
      razorpay_order_id: "order_123",
      razorpay_payment_id: "pay_123",
      razorpay_signature: "x".repeat(32),
    });

    const res = await confirmPost(
      new Request("http://localhost:3000/api/me/payments/razorpay/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns a 200 for unsuccessful payment status and does not treat it as a mutation", async () => {
    vi.mocked(Pay.confirmRazorpayCheckout).mockResolvedValue({ handled: false, reason: "not_captured" });
    const body = JSON.stringify({
      razorpay_order_id: "order_123",
      razorpay_payment_id: "pay_123",
      razorpay_signature: "x".repeat(32),
    });

    const res = await confirmPost(
      new Request("http://localhost:3000/api/me/payments/razorpay/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ handled: false, reason: "not_captured" });
  });

  it("accepts a valid confirmation and repeats the idempotent success path", async () => {
    vi.mocked(Pay.confirmRazorpayCheckout).mockResolvedValue({ handled: true });
    const body = JSON.stringify({
      razorpay_order_id: "order_123",
      razorpay_payment_id: "pay_123",
      razorpay_signature: "x".repeat(32),
    });

    const first = await confirmPost(
      new Request("http://localhost:3000/api/me/payments/razorpay/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );

    expect(first.status).toBe(200);
    expect((await first.json()).data).toMatchObject({ handled: true });

    vi.mocked(Pay.confirmRazorpayCheckout).mockResolvedValue({ handled: true, duplicate: true });
    const second = await confirmPost(
      new Request("http://localhost:3000/api/me/payments/razorpay/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );

    expect(second.status).toBe(200);
    expect((await second.json()).data).toMatchObject({ handled: true, duplicate: true });
  });

  it("surfaces an explicit invalid-signature service error from the confirm endpoint", async () => {
    vi.mocked(Pay.confirmRazorpayCheckout).mockRejectedValue(new AppError("INVALID_SIGNATURE", 400, "Invalid payment signature"));
    const body = JSON.stringify({
      razorpay_order_id: "order_123",
      razorpay_payment_id: "pay_123",
      razorpay_signature: "x".repeat(32),
    });

    const res = await confirmPost(
      new Request("http://localhost:3000/api/me/payments/razorpay/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_SIGNATURE");
  });
});
