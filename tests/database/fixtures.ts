import { Types } from "mongoose";
import { makeUniqueCats, media } from "../helpers";
import { Payment } from "@/models/Payment";
import * as Cust from "@/services/customer.service";
import * as O from "@/services/order.service";
import * as P from "@/services/pet.service";
import * as Prod from "@/services/product.service";

export const addr = {
  recipientName: "Asha",
  phone: "+91 9999999999",
  line1: "1 Main St",
  city: "Chennai",
  state: "TN",
  postalCode: "600001",
};

export async function customer(sub = "g-1", email = "a@x.com") {
  const { customer: c } = await Cust.upsertCustomerFromGoogle({
    sub,
    email,
    email_verified: true,
    name: "Asha",
  });

  const addressId = await Cust.addAddress(String(c._id), addr);

  return {
    id: String(c._id),
    addressId,
  };
}

export async function publishedProduct(
  categoryId: string,
  stock = 5,
  over: Record<string, unknown> = {},
) {
  const suffix = Math.random().toString(36).slice(2, 8);

  const p = await Prod.createProduct({
    name: `Ball ${suffix}`,
    sku: `SKU-${suffix}`,
    categoryId,
    compatibility: ["dog"],
    price: 100000,
    stockQuantity: stock,
    description: "A bouncy ball for dogs",
    media,
    taxRateBps: 0,
    ...over,
  });

  return Prod.setProductPublication(String(p._id), "published");
}

export async function publishedPet(categoryId: string) {
  const suffix = Math.random().toString(36).slice(2, 8);

  const p = await P.createPet({
    name: `Rex ${suffix}`,
    type: "dog",
    categoryId,
    price: 5000000,
    description: "Friendly labrador puppy, vaccinated.",
    media,
    microchipId: `MC-${suffix}`,
  });

  return P.setPetPublication(String(p._id), "published");
}

/**
 * Product + customer + placed order + a pending Razorpay payment.
 * Mimics createRazorpayOrder without making a network request.
 */
export async function paidSetup(
  opts: {
    stock?: number;
    ref?: string;
    rzpOrderId?: string;
  } = {},
) {
  const { toys } = await makeUniqueCats();

  const prod = await publishedProduct(toys.id, opts.stock ?? 10);
  const c = await customer();

  const { order } = await O.createOrder(c.id, {
    items: [
      {
        itemType: "product",
        productId: String(prod._id),
        quantity: 1,
      },
    ],
    shippingAddressId: c.addressId,
    idempotencyKey: `idem-${Math.random().toString(36).slice(2)}-xx`,
  });

  const suffix = Math.random().toString(36).slice(2, 8);

  const payment = await Payment.create({
    paymentRef: opts.ref ?? `PAY-${suffix}`,
    orderId: order._id,
    customerId: c.id,
    provider: "razorpay",
    providerOrderId: opts.rzpOrderId ?? `order_${suffix}`,
    amount: order.grandTotal,
    currency: "INR",
  });

  return { prod, c, order, payment, toys };
}

/**
 * Creates a Razorpay payment.captured event for a test payment.
 *
 * By default, uses the payment's stored providerOrderId so the event
 * matches the payment created by paidSetup().
 *
 * Pass orderId explicitly when a test needs a specific provider order ID.
 * The over argument remains available for amount, currency, and other
 * payload overrides used in validation tests.
 */
export const captured = (
  payment: {
    paymentRef: string;
    amount: number;
    providerOrderId?: string | null;
  },
  over: Record<string, unknown> = {},
  orderId =
    payment.providerOrderId ??
    `order_${Math.random().toString(36).slice(2, 8)}`,
  payId = `pay_${Math.random().toString(36).slice(2, 8)}`,
) => ({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: payId,
        order_id: orderId,
        amount: payment.amount,
        currency: "INR",
        status: "captured",
        method: "upi",
        notes: {
          paymentRef: payment.paymentRef,
        },
        ...over,
      },
    },
  },
});

export const refundEvent = (
  event: "refund.processed" | "refund.failed",
  refund: {
    id: string;
    payment_id: string;
    amount: number;
    notes?: Record<string, string>;
  },
) => ({
  event,
  payload: {
    refund: {
      entity: {
        status: event === "refund.processed" ? "processed" : "failed",
        ...refund,
      },
    },
  },
});

/**
 * Mimics what refundPayment(destination: "original") persists
 * before calling Razorpay. No network request is made in tests.
 */
export async function seedPendingOriginalRefund(
  paymentId: Types.ObjectId,
  amount: number,
  orderId: Types.ObjectId,
  providerRefundId?: string,
) {
  const refundId = new Types.ObjectId();

  await Payment.updateOne(
    { _id: paymentId },
    {
      $inc: { amountRefunded: amount },
      $set: { status: "partially_refunded" },
      $push: {
        refunds: {
          refundId,
          destination: "original",
          amount,
          status: "pending",
          createdAt: new Date(),
          ...(providerRefundId ? { providerRefundId } : {}),
        },
      },
    },
  );

  const { Order } = await import("@/models/Order");

  await Order.updateOne(
    { _id: orderId },
    {
      $set: {
        paymentStatus: "partially_refunded",
        amountRefunded: amount,
      },
    },
  );

  return refundId;
}