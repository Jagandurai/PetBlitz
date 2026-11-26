export const inr = (minor: number | null | undefined) => `₹${((minor ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const rupeesToMinor = (v: string | number) => Math.round(Number(v) * 100);
export const minorToRupees = (m: number | null | undefined) => (m == null ? "" : String(m / 100));
export const dt = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const day = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—");
export const title = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export const tone = (status: string): "ok" | "warn" | "bad" | "info" | "" => {
  if (["delivered", "paid", "approved", "refunded", "succeeded", "active", "published", "available", "resolved", "in_stock", "sent", "received"].includes(status)) return "ok";
  if (["cancelled", "failed", "rejected", "suspended", "out_of_stock", "hidden", "archived", "sold", "closed"].includes(status)) return "bad";
  if (["pending", "placed", "requested", "draft", "reserved", "low_stock", "partially_refunded", "refund_initiated", "open"].includes(status)) return "warn";
  return "info";
};
