export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "backorder";

export function computeStockStatus(p: {
  trackInventory: boolean;
  stockQuantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  backorderPolicy: "deny" | "allow";
}): { availableQuantity: number; stockStatus: StockStatus } {
  if (!p.trackInventory) return { availableQuantity: Number.MAX_SAFE_INTEGER, stockStatus: "in_stock" };
  const available = Math.max(0, p.stockQuantity - p.reservedQuantity);
  if (available <= 0) return { availableQuantity: 0, stockStatus: p.backorderPolicy === "allow" ? "backorder" : "out_of_stock" };
  if (available <= p.lowStockThreshold) return { availableQuantity: available, stockStatus: "low_stock" };
  return { availableQuantity: available, stockStatus: "in_stock" };
}
