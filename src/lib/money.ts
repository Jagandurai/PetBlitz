/**
 * MONEY REPRESENTATION
 * All monetary values are INTEGERS in minor units (INR paise, 1 INR = 100). Currency precision = 2.
 * Never use floats for money. Prices are TAX-EXCLUSIVE; tax is added per line (see order.service).
 */
export const DEFAULT_CURRENCY = "INR";
export const CURRENCY_PRECISION = 2;

export type DiscountType = "none" | "percent" | "fixed";

export function calcFinalPrice(price: number, type: DiscountType, value: number): number {
  if (!Number.isInteger(price) || price < 0) throw new RangeError("price must be a non-negative integer (minor units)");
  if (value < 0) throw new RangeError("discount must not be negative");
  if (type === "none" || value === 0) return price;
  if (type === "percent") {
    if (value > 100) throw new RangeError("percent discount cannot exceed 100");
    return price - Math.round((price * value) / 100);
  }
  if (!Number.isInteger(value)) throw new RangeError("fixed discount must be an integer (minor units)");
  if (value > price) throw new RangeError("fixed discount cannot exceed price");
  return price - value;
}

export const calcTax = (netAmount: number, rateBps: number) => Math.round((netAmount * rateBps) / 10_000);
