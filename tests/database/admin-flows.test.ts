import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import {
  cleanDb,
  HAS_DB,
  makeUniqueCats,
  setupDb,
  teardownDb,
} from "../helpers";
import {
  captured as capturedFixture,
  customer,
  paidSetup,
  publishedPet,
  publishedProduct,
  refundEvent,
  seedPendingOriginalRefund,
} from "./fixtures";
import { Order } from "@/models/Order";
import { Payment } from "@/models/Payment";
import { Pet } from "@/models/Pet";
import { Product } from "@/models/Product";
import * as O from "@/services/order.service";
import * as P from "@/services/pet.service";
import * as Prod from "@/services/product.service";
import * as Pay from "@/services/payment.service";
import * as W from "@/services/wallet.service";
import * as Cu from "@/services/customer.service";
import * as M from "@/services/message.service";
import { runMaintenance } from "@/services/maintenance.service";
import { Customer } from "@/models/Customer";

// Mongoose docs type providerOrderId as `string | null | undefined`, but the
// fixture only accepts `string | undefined`. This wrapper normalises null.
type CapturedRest = Parameters<typeof capturedFixture> extends [
  unknown,
  ...infer R,
]
  ? R
  : never;

function captured(
  payment: {
    paymentRef: string;
    amount: number;
    providerOrderId?: string | null;
  },
  ...rest: CapturedRest
) {
  return capturedFixture(
    {
      paymentRef: payment.paymentRef,
      amount: payment.amount,
      providerOrderId: payment.providerOrderId ?? undefined,
    },
    ...rest,
  );
}

describe.skipIf(!HAS_DB)(
  "Razorpay refund-webhook idempotency REGRESSION (PetBlitzTest)",
  () => {
    beforeAll(setupDb, 30000);
    beforeEach(cleanDb, 30000);
    afterAll(teardownDb);

    async function paid() {
      const s = await paidSetup();

      const result = await Pay.processRazorpayEvent(
        `evt_paid_${s.payment.paymentRef}`,
        captured(s.payment),
      );

      if (!result.handled) {
        throw new Error(
          `Test setup failed to capture payment ${s.payment.paymentRef}: ${result.reason}`,
        );
      }

      const savedPayment = await Payment.findById(s.payment._id).lean();

      if (!savedPayment?.providerPaymentId) {
        throw new Error(
          `Test setup did not persist providerPaymentId for ${s.payment.paymentRef}`,
        );
      }

      return {
        ...s,
        providerPaymentId: savedPayment.providerPaymentId,
      };
    }

    it("an UNMATCHED refund event is not consumed: a later delivery of the same event id is processed", async () => {
      const { payment, order, providerPaymentId } = await paid();

      const refundId = new Types.ObjectId();

      const ev = refundEvent("refund.failed", {
        id: "rfnd_1",
        payment_id: providerPaymentId,
        amount: 1000,
        notes: { refundId: String(refundId) },
      });

      const first = await Pay.processRazorpayEvent("evt_r1", ev);

      // The refund entry does not exist yet.
      expect(first).toMatchObject({
        handled: false,
        reason: "refund_not_found",
      });

      expect(
        (await Payment.findById(payment._id).lean())!.processedEvents.some(
          (e) => e.eventId === "evt_r1",
        ),
      ).toBe(false); // Claim released.

      await Payment.updateOne(
        { _id: payment._id },
        {
          $inc: { amountRefunded: 1000 },
          $set: { status: "partially_refunded" },
          $push: {
            refunds: {
              refundId,
              destination: "original",
              amount: 1000,
              status: "pending",
              createdAt: new Date(),
            },
          },
        },
      );

      const second = await Pay.processRazorpayEvent("evt_r1", ev);

      // The same event can now be processed because the refund exists.
      expect(second.handled).toBe(true);

      const p = (await Payment.findById(payment._id).lean())!;

      expect(p.refunds[0]!.status).toBe("failed");
      expect(p.amountRefunded).toBe(0); // Reservation released.
      expect(p.status).toBe("paid");

      expect(
        (await Order.findById(order._id).lean())!.paymentStatus,
      ).toBe("paid");
    });

    it("refund.processed applies once; duplicate delivery is a no-op", async () => {
      const { payment, order, providerPaymentId } = await paid();

      const refundId = await seedPendingOriginalRefund(
        payment._id,
        2000,
        order._id,
      );

      const ev = refundEvent("refund.processed", {
        id: "rfnd_2",
        payment_id: providerPaymentId,
        amount: 2000,
        notes: { refundId: String(refundId) },
      });

      expect(
        (await Pay.processRazorpayEvent("evt_r2", ev)).handled,
      ).toBe(true);

      expect(
        (await Pay.processRazorpayEvent("evt_r2", ev)).duplicate,
      ).toBe(true);

      const p = (await Payment.findById(payment._id).lean())!;

      expect(p.refunds).toHaveLength(1);
      expect(p.refunds[0]).toMatchObject({
        status: "succeeded",
        providerRefundId: "rfnd_2",
      });
      expect(p.amountRefunded).toBe(2000);
      expect(
        p.processedEvents.filter((e) => e.eventId === "evt_r2"),
      ).toHaveLength(1);
    });

    it("refund.failed releases the reserved amount exactly once, even if delivered twice (atomic)", async () => {
      const { payment, order, providerPaymentId } = await paid();

      const refundId = await seedPendingOriginalRefund(
        payment._id,
        3000,
        order._id,
        "rfnd_3",
      );

      const ev = refundEvent("refund.failed", {
        id: "rfnd_3",
        payment_id: providerPaymentId,
        amount: 3000,
      });

      await Pay.processRazorpayEvent("evt_f1", ev);
      await Pay.processRazorpayEvent("evt_f1", ev); // Exact duplicate.
      await Pay.processRazorpayEvent("evt_f2", ev); // Different event ID, same refund.

      const p = (await Payment.findById(payment._id).lean())!;

      expect(p.amountRefunded).toBe(0);
      expect(p.status).toBe("paid");
      expect(
        p.refunds.find((r) => String(r.refundId) === String(refundId))!.status,
      ).toBe("failed");
    });

    it("out-of-order: refund.failed after refund.processed does not undo a succeeded refund", async () => {
      const { payment, order, providerPaymentId } = await paid();

      await seedPendingOriginalRefund(
        payment._id,
        1500,
        order._id,
        "rfnd_4",
      );

      await Pay.processRazorpayEvent(
        "evt_o1",
        refundEvent("refund.processed", {
          id: "rfnd_4",
          payment_id: providerPaymentId,
          amount: 1500,
        }),
      );

      await Pay.processRazorpayEvent(
        "evt_o2",
        refundEvent("refund.failed", {
          id: "rfnd_4",
          payment_id: providerPaymentId,
          amount: 1500,
        }),
      );

      const p = (await Payment.findById(payment._id).lean())!;

      expect(p.refunds[0]!.status).toBe("succeeded");
      expect(p.amountRefunded).toBe(1500);
    });

    it("a refund issued from the Razorpay dashboard is recorded once and never exceeds the payment", async () => {
      const { payment, order, providerPaymentId } = await paid();

      const ev = refundEvent("refund.processed", {
        id: "rfnd_dash",
        payment_id: providerPaymentId,
        amount: 4000,
      });

      expect(
        (await Pay.processRazorpayEvent("evt_d1", ev)).reason,
      ).toBe("external_refund_recorded");

      await Pay.processRazorpayEvent("evt_d2", ev); // Retry with a new event ID.

      let p = (await Payment.findById(payment._id).lean())!;

      expect(
        p.refunds.filter((r) => r.providerRefundId === "rfnd_dash"),
      ).toHaveLength(1);
      expect(p.amountRefunded).toBe(4000);

      expect(
        (await Order.findById(order._id).lean())!.paymentStatus,
      ).toBe("partially_refunded");

      await Pay.processRazorpayEvent(
        "evt_d3",
        refundEvent("refund.processed", {
          id: "rfnd_huge",
          payment_id: providerPaymentId,
          amount: payment.amount * 10,
        }),
      );

      p = (await Payment.findById(payment._id).lean())!;

      expect(p.amountRefunded).toBe(4000); // Oversize external refund ignored.
    });

    it("wallet refunds stuck in 'pending' are finalised by the sweeper without double-crediting", async () => {
      const { payment, order, c } = await paid();

      await Payment.updateOne(
        { _id: payment._id },
        {
          $inc: { amountRefunded: 5000 },
          $set: { status: "partially_refunded" },
          $push: {
            refunds: {
              refundId: new Types.ObjectId(),
              destination: "wallet",
              amount: 5000,
              status: "pending",
              createdAt: new Date(Date.now() - 3600_000),
            },
          },
        },
      );

      expect(await Pay.reconcilePendingWalletRefunds()).toBe(1);
      expect(await Pay.reconcilePendingWalletRefunds()).toBe(0);
      expect((await W.getWallet(c.id)).balance).toBe(5000);

      expect(
        (await Payment.findById(payment._id).lean())!.refunds[0]!.status,
      ).toBe("succeeded");

      expect(order._id).toBeTruthy();
    });
  },
);

describe.skipIf(!HAS_DB)(
  "payments: duplicate payment, wallet top-up (PetBlitzTest)",
  () => {
    beforeAll(setupDb, 30000);
    beforeEach(cleanDb, 30000);
    afterAll(teardownDb);

    it("paying the same order by wallet AND Razorpay settles once; the second payment is refunded to the wallet", async () => {
      const { c, order, payment, prod } = await paidSetup();
      const grand = payment.amount;

      await W.creditWallet(c.id, grand + 50, {
        reason: "topup",
        idempotencyKey: "seed-credit-1",
      });

      await Pay.payOrderWithWallet(String(order._id), c.id);
      await Pay.processRazorpayEvent("evt_dup", captured(payment));

      const o = (await Order.findById(order._id).lean())!;

      expect(o.paymentStatus).toBe("paid");
      expect(String(o.paidPaymentId)).not.toBe(String(payment._id));
      expect((await W.getWallet(c.id)).balance).toBe(50 + grand);
      expect(
        (await Product.findById(prod._id).lean())!.stockQuantity,
      ).toBe(9);
      expect(
        (await Payment.findById(payment._id).lean())!.status,
      ).toBe("refunded");
    });

    it("wallet top-up: credited once on verified capture; mismatch and duplicates ignored; not refundable", async () => {
      const c = await customer();

      const top = await Payment.create({
        paymentRef: "PAY-TOP1",
        purpose: "wallet_topup",
        customerId: c.id,
        provider: "razorpay",
        providerOrderId: "order_TOP1",
        amount: 50000,
        currency: "INR",
      });

      const ev = captured(top, {}, "order_TOP1", "pay_top1");

      expect(
        (
          await Pay.processRazorpayEvent(
            "evt_t0",
            captured(top, { amount: 1 }, "order_TOP1", "pay_top1"),
          )
        ).reason,
      ).toBe("mismatch");

      expect((await W.getWallet(c.id)).balance).toBe(0);

      await Pay.processRazorpayEvent("evt_t1", ev);
      await Pay.processRazorpayEvent("evt_t1", ev);
      await Pay.processRazorpayEvent("evt_t2", {
        event: "order.paid",
        payload: ev.payload,
      });

      expect((await W.getWallet(c.id)).balance).toBe(50000);

      await expect(
        Pay.refundPayment({
          paymentId: String(top._id),
          amount: 100,
          destination: "wallet",
        }),
      ).rejects.toMatchObject({ code: "REFUND_NOT_SUPPORTED" });
    });

    it("admin refundOrder: partial then remainder to wallet; nothing left -> 409", async () => {
      const { c, order, payment } = await paidSetup();

      await Pay.processRazorpayEvent("evt_x", captured(payment));

      await Pay.refundOrder(String(order._id), {
        amount: 1000,
        reason: "damaged",
      });

      await Pay.refundOrder(String(order._id), {});

      expect((await W.getWallet(c.id)).balance).toBe(payment.amount);

      await expect(
        Pay.refundOrder(String(order._id), {}),
      ).rejects.toMatchObject({ code: "NOTHING_TO_REFUND" });
    });
  },
);

describe.skipIf(!HAS_DB)(
  "orders / inventory / admin rules (PetBlitzTest)",
  () => {
    beforeAll(setupDb, 30000);
    beforeEach(cleanDb, 30000);
    afterAll(teardownDb);

    it("customers cannot cancel once processing; admins can", async () => {
      const { c, order } = await paidSetup();

      await Order.updateOne(
        { _id: order._id },
        { $set: { status: "processing" } },
      );

      await expect(
        Pay.cancelOrderWithRefund(
          String(order._id),
          { type: "customer", id: c.id },
          "x",
          c.id,
        ),
      ).rejects.toMatchObject({ code: "CANCEL_NOT_ALLOWED" });

      await expect(
        Pay.cancelOrderWithRefund(
          String(order._id),
          { type: "admin", id: "a" },
          "x",
        ),
      ).resolves.toBeTruthy();
    });

    it("refund-related statuses require matching payment state", async () => {
      const { order } = await paidSetup();

      await Order.updateOne(
        { _id: order._id },
        { $set: { status: "delivered" } },
      );

      await expect(
        O.transitionOrderStatus(
          String(order._id),
          "refund_initiated",
          { type: "admin" },
        ),
      ).rejects.toMatchObject({ code: "NOTHING_TO_REFUND" });

      await Order.updateOne(
        { _id: order._id },
        { $set: { paymentStatus: "paid", status: "refund_initiated" } },
      );

      await expect(
        O.transitionOrderStatus(String(order._id), "refunded", {
          type: "admin",
        }),
      ).rejects.toMatchObject({ code: "REFUND_INCOMPLETE" });

      await Order.updateOne(
        { _id: order._id },
        { $set: { paymentStatus: "refunded" } },
      );

      await expect(
        O.transitionOrderStatus(String(order._id), "refunded", {
          type: "admin",
        }),
      ).resolves.toBeTruthy();
    });

    it("stock adjustments are atomic and never go below zero or below reserved", async () => {
      const { toys } = await makeUniqueCats();
      const prod = await publishedProduct(toys.id, 5);
      const id = String(prod._id);

      await Prod.reserveStock(prod._id as Types.ObjectId, 3);

      await expect(
        Prod.adjustStock(id, { mode: "set", value: 2 }),
      ).rejects.toMatchObject({ code: "STOCK_BELOW_RESERVED" });

      await expect(
        Prod.adjustStock(id, { mode: "adjust", value: -3 }),
      ).rejects.toMatchObject({ code: "STOCK_BELOW_RESERVED" });

      await expect(
        Prod.adjustStock(id, { mode: "set", value: -1 }),
      ).rejects.toMatchObject({ code: "INVALID_QUANTITY" });

      expect(
        await Prod.adjustStock(id, { mode: "set", value: 3 }),
      ).toMatchObject({
        stockQuantity: 3,
        reservedQuantity: 3,
        availableQuantity: 0,
      });

      expect(
        (await Prod.adjustStock(id, { mode: "adjust", value: 7 }))
          .stockQuantity,
      ).toBe(10);

      const untracked = await publishedProduct(toys.id, 0, {
        trackInventory: false,
      });

      await expect(
        Prod.adjustStock(String(untracked._id), {
          mode: "adjust",
          value: 1,
        }),
      ).rejects.toMatchObject({ code: "INVENTORY_NOT_TRACKED" });

      await expect(
        Prod.adjustStock(String(new Types.ObjectId()), {
          mode: "adjust",
          value: 1,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("pet availability: toggle works; sold and actively reserved pets are locked", async () => {
      const { lab } = await makeUniqueCats();
      const pet = await publishedPet(lab.id);
      const id = String(pet._id);

      expect(
        (await P.setPetAvailability(id, "unavailable")).availabilityStatus,
      ).toBe("unavailable");

      expect(
        (await P.setPetAvailability(id, "available")).availabilityStatus,
      ).toBe("available");

      await P.reservePet(id, new Types.ObjectId(), new Types.ObjectId());

      await expect(
        P.setPetAvailability(id, "unavailable"),
      ).rejects.toMatchObject({ code: "PET_LOCKED" });

      await Pet.updateOne(
        { _id: id },
        { $set: { availabilityStatus: "sold" } },
      );

      await expect(
        P.setPetAvailability(id, "available"),
      ).rejects.toMatchObject({ code: "PET_LOCKED" });
    });

    it("admin reads: pets include private fields; orders list filters; order detail has payments without webhook internals", async () => {
      const { lab } = await makeUniqueCats();
      const pet = await publishedPet(lab.id);

      expect(
        (await P.getPetAdmin(String(pet._id))).microchipId,
      ).toMatch(/^MC-/);

      expect(
        (await P.listPetsAdmin({
          status: "published",
          page: 1,
          pageSize: 10,
        })).total,
      ).toBe(1);

      const { order, payment } = await paidSetup({ ref: "PAY-A1" });

      expect(
        (await O.listOrdersAdmin({
          status: "placed",
          page: 1,
          pageSize: 10,
        })).total,
      ).toBe(1);

      expect(
        (await O.listOrdersAdmin({
          status: "delivered",
          page: 1,
          pageSize: 10,
        })).total,
      ).toBe(0);

      expect(
        (await O.listOrdersAdmin({
          q: order.orderNumber.toLowerCase(),
          page: 1,
          pageSize: 10,
        })).total,
      ).toBe(1);

      const d = await O.getOrderAdmin(String(order._id));

      expect(d.payments).toHaveLength(1);
      expect(JSON.stringify(d.payments)).not.toContain("processedEvents");
      expect(String(d.payments[0]!._id)).toBe(String(payment._id));
    });

    it("maintenance: unpaid orders past the TTL are cancelled and stock is released (idempotent)", async () => {
      const { order, prod } = await paidSetup();

      await Order.collection.updateOne(
        { _id: new Types.ObjectId(String(order._id)) },
        { $set: { createdAt: new Date(Date.now() - 24 * 3600_000) } },
      );

      expect((await runMaintenance()).ordersCancelled).toBe(1);
      expect((await runMaintenance()).ordersCancelled).toBe(0);

      expect(
        (await Order.findById(order._id).lean())!.status,
      ).toBe("cancelled");

      expect(
        (await Product.findById(prod._id).lean())!.reservedQuantity,
      ).toBe(0);
    });
  },
);

describe.skipIf(!HAS_DB)(
  "customers, wallet admin, support admin (PetBlitzTest)",
  () => {
    beforeAll(setupDb, 30000);
    beforeEach(cleanDb, 30000);
    afterAll(teardownDb);

    it("admin wallet adjustments are idempotent, ledgered, and cannot overdraw; suspended wallets stay visible to admins", async () => {
      const c = await customer();

      const adj = {
        customerId: c.id,
        direction: "credit" as const,
        amount: 20000,
        reason: "goodwill",
        idempotencyKey: "adj-key-0001",
      };

      await W.adminAdjustWallet(adj, "admin-api-key");
      await W.adminAdjustWallet(adj, "admin-api-key");

      expect((await W.getWallet(c.id)).balance).toBe(20000);

      await expect(
        W.adminAdjustWallet(
          {
            ...adj,
            direction: "debit",
            amount: 30000,
            idempotencyKey: "adj-key-0002",
          },
          "admin-api-key",
        ),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_WALLET_BALANCE" });

      await Cu.setCustomerStatus(c.id, "suspended");

      await expect(
        W.getWallet(c.id),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      const adminView = await W.getWallet(c.id, 1, 20, { admin: true });

      expect(adminView.balance).toBe(20000);
      expect(adminView.transactions[0]).toMatchObject({
        createdBy: "admin-api-key",
      });
      expect((await W.reconcileWallet(c.id)).consistent).toBe(true);

      await Customer.updateOne(
        { _id: c.id },
        { $set: { walletBalance: 1 } },
      );

      expect(await W.reconcileWallet(c.id, true)).toMatchObject({
        consistent: false,
        fixed: true,
      });

      expect((await W.reconcileWallet(c.id)).consistent).toBe(true);
    });

    it("addresses: edit and default handling; admin customer reads hide the Google id", async () => {
      const c = await customer("g-9", "nine@x.com");

      await Cu.updateAddress(c.id, c.addressId, {
        landmark: "Near temple",
      });

      await Cu.setDefaultAddress(c.id, c.addressId, {
        billing: true,
      });

      const profile = await Cu.getOwnProfile(c.id);

      expect(profile.addresses[0]).toMatchObject({
        landmark: "Near temple",
      });

      await expect(
        Cu.updateAddress(c.id, String(new Types.ObjectId()), {
          landmark: "x",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      const list = await Cu.listCustomersAdmin({
        q: "NINE@x.com",
        page: 1,
        pageSize: 10,
      });

      expect(list.total).toBe(1);
      expect(JSON.stringify(list)).not.toContain("g-9");
      expect(JSON.stringify(await Cu.getCustomerAdmin(c.id))).not.toContain(
        "g-9",
      );
    });

    it("tickets (admin): paginated list, thread slice, reply moves ticket to pending, customer reply reopens", async () => {
      const c = await customer();

      const t = await M.createCustomerTicket(c.id, {
        subject: "Need help",
        body: "First message",
      });

      const list = await M.listTicketsAdmin({
        status: "open",
        page: 1,
        pageSize: 10,
      });

      expect(list).toMatchObject({ total: 1, page: 1 });

      await M.addAdminReply(t.id, "admin-api-key", {
        body: "We are on it",
      });

      expect((await M.getTicketAdmin(t.id)).status).toBe("pending");

      await M.addCustomerReply(c.id, t.id, { body: "Thanks" });

      const full = await M.getTicketAdmin(t.id);

      expect(full.status).toBe("open");
      expect(full.thread).toHaveLength(3);

      await M.setTicketStatus(t.id, "resolved");

      expect((await M.getTicketAdmin(t.id)).resolvedAt).toBeTruthy();

      await expect(
        M.getTicketAdmin(String(new Types.ObjectId())),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  },
);