import { calcTax } from "@/lib/money";

export interface PricedInput { unitPrice: number; unitDiscount: number; quantity: number; taxRateBps: number; extraDiscount?: number; inclusive?: boolean }

/**
 * One order line, all integer paise.
 *  exclusive (default): tax = round(net * rate); lineTotal = net + tax          (prices exclude GST)
 *  inclusive:           tax = gross - round(gross / (1 + rate)); lineTotal = gross  (prices already include GST)
 * `extraDiscount` is this line's share of an order-level coupon; tax is always computed AFTER discounts.
 */
export function computeLine(i: PricedInput) {
  const subtotal = i.unitPrice * i.quantity;
  const discountAmount = i.unitDiscount * i.quantity + (i.extraDiscount ?? 0);
  const gross = subtotal - discountAmount;
  if (gross < 0) throw new RangeError("discount exceeds line value");
  if (i.inclusive) {
    const net = Math.round((gross * 10_000) / (10_000 + i.taxRateBps));
    return { subtotal, discountAmount, taxAmount: gross - net, lineTotal: gross };
  }
  const taxAmount = calcTax(gross, i.taxRateBps);
  return { subtotal, discountAmount, taxAmount, lineTotal: gross + taxAmount };
}

export function computeOrderTotals(lines: ReturnType<typeof computeLine>[], shippingTotal: number) {
  const subtotal = lines.reduce((a, l) => a + l.subtotal, 0);
  const discountTotal = lines.reduce((a, l) => a + l.discountAmount, 0);
  const taxTotal = lines.reduce((a, l) => a + l.taxAmount, 0);
  const grandTotal = lines.reduce((a, l) => a + l.lineTotal, 0) + shippingTotal;
  return { subtotal, discountTotal, taxTotal, shippingTotal, grandTotal };
}

/** Splits `total` across `weights` proportionally; the shares always sum to exactly `total` (largest-remainder). */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w * total) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k]!.i]! += 1;
  return out.map((v, i) => Math.min(v, weights[i]!)); // a share can never exceed its own line
}

export interface CouponRule { type: "percent" | "fixed"; value: number; minOrderMinor: number; maxDiscountMinor?: number | null }
/** Discount for an eligible base amount (paise). Returns 0 when the minimum order is not met. */
export function couponAmount(c: CouponRule, eligibleBase: number): number {
  if (eligibleBase <= 0 || eligibleBase < c.minOrderMinor) return 0;
  let d = c.type === "percent" ? Math.round((eligibleBase * Math.min(c.value, 100)) / 100) : c.value;
  if (c.maxDiscountMinor) d = Math.min(d, c.maxDiscountMinor);
  return Math.min(d, eligibleBase);
}

/** Shipping from admin settings: per-state override, then base fee; free above the threshold (measured after discounts). */
export function computeShipping(s: { baseFeeMinor: number; freeAboveMinor: number | null; stateFees: Record<string, number> }, discountedSubtotal: number, stateCode?: string): number {
  if (s.freeAboveMinor != null && discountedSubtotal >= s.freeAboveMinor) return 0;
  const override = stateCode ? s.stateFees[stateCode] : undefined;
  return override ?? s.baseFeeMinor;
}
