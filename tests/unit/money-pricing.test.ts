import { describe, expect, it } from "vitest";
import { calcFinalPrice, calcTax } from "@/lib/money";
import { computeLine, computeOrderTotals } from "@/services/order.service";

describe("money", () => {
  it("applies percent and fixed discounts in integer minor units", () => {
    expect(calcFinalPrice(100000, "percent", 10)).toBe(90000);
    expect(calcFinalPrice(100000, "fixed", 2500)).toBe(97500);
    expect(calcFinalPrice(100000, "none", 0)).toBe(100000);
  });
  it("rejects negative prices/discounts and over-discounts", () => {
    expect(() => calcFinalPrice(-1, "none", 0)).toThrow();
    expect(() => calcFinalPrice(1000, "fixed", -5)).toThrow();
    expect(() => calcFinalPrice(1000, "fixed", 2000)).toThrow();
    expect(() => calcFinalPrice(1000, "percent", 101)).toThrow();
  });
  it("recalculates order totals on the server", () => {
    const a = computeLine({ unitPrice: 50000, unitDiscount: 5000, quantity: 2, taxRateBps: 1800 }); // net 90000, tax 16200
    const b = computeLine({ unitPrice: 1000, unitDiscount: 0, quantity: 1, taxRateBps: 0 });
    expect(a).toEqual({ subtotal: 100000, discountAmount: 10000, taxAmount: 16200, lineTotal: 106200 });
    expect(computeOrderTotals([a, b], 4900)).toEqual({ subtotal: 101000, discountTotal: 10000, taxTotal: 16200, shippingTotal: 4900, grandTotal: 112100 });
    expect(calcTax(999, 1800)).toBe(180);
  });
});
