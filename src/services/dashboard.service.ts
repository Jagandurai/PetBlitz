import { connectDB } from "@/lib/db/connection";
import { Message } from "@/models/Message";
import { Order } from "@/models/Order";
import { Pet } from "@/models/Pet";
import { Product } from "@/models/Product";
import { Review } from "@/models/Review";
import { Customer } from "@/models/Customer";
import { ReturnRequest } from "@/models/Ops";

/** Admin home: queue sizes + sales for the last 7/30 days (paid orders only, paise). */
export async function getDashboard() {
  await connectDB();
  const day = 86_400_000, now = Date.now();
  const since = (d: number) => new Date(now - d * day);
  const sales = async (d: number) => { const [a] = await Order.aggregate([{ $match: { paymentStatus: { $in: ["paid", "partially_refunded"] }, createdAt: { $gte: since(d) } } }, { $group: { _id: null, revenue: { $sum: { $subtract: ["$amountPaid", "$amountRefunded"] } }, orders: { $sum: 1 } } }]); return { revenue: a?.revenue ?? 0, orders: a?.orders ?? 0 }; };
  const [last7, last30, toAccept, toShip, unpaid, pendingReviews, openTickets, openReturns, lowStock, petsAvailable, customers, daily] = await Promise.all([
    sales(7), sales(30),
    Order.countDocuments({ status: "placed", paymentStatus: "paid" }),
    Order.countDocuments({ status: { $in: ["confirmed", "processing"] } }),
    Order.countDocuments({ status: "placed", paymentStatus: "pending" }),
    Review.countDocuments({ status: "pending" }),
    Message.countDocuments({ status: { $in: ["open", "pending"] } }),
    ReturnRequest.countDocuments({ status: { $in: ["requested", "received"] } }),
    Product.countDocuments({ status: "published", trackInventory: true, $expr: { $lte: [{ $subtract: ["$stockQuantity", "$reservedQuantity"] }, "$lowStockThreshold"] } }),
    Pet.countDocuments({ status: "published", availabilityStatus: "available" }),
    Customer.countDocuments({ status: "active" }),
    Order.aggregate([{ $match: { paymentStatus: { $in: ["paid", "partially_refunded"] }, createdAt: { $gte: since(14) } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: "$amountPaid" }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  return { sales: { last7, last30 }, queues: { toAccept, toShip, unpaid, pendingReviews, openTickets, openReturns, lowStock }, totals: { petsAvailable, customers }, daily: daily.map((d) => ({ date: d._id as string, revenue: d.revenue as number, orders: d.orders as number })) };
}

export type ReportPeriod = "daily" | "weekly" | "monthly" | "yearly";
export interface ReportRow { period: string; orders: number; gross: number; discounts: number; shipping: number; tax: number; refunded: number; net: number }

const UNIT = { daily: "day", weekly: "week", monthly: "month", yearly: "year" } as const;
const FORMAT = { daily: "%Y-%m-%d", weekly: "%Y-%m-%d", monthly: "%Y-%m", yearly: "%Y" } as const;
const DEFAULT_DAYS = { daily: 30, weekly: 84, monthly: 365, yearly: 365 * 5 } as const;

/** Paid orders grouped by calendar period in IST (weeks start Monday). Amounts in paise. */
export async function getSalesReport(period: ReportPeriod, from?: string, to?: string): Promise<ReportRow[]> {
  await connectDB();
  const end = to ? new Date(`${to}T23:59:59.999+05:30`) : new Date();
  const start = from ? new Date(`${from}T00:00:00+05:30`) : new Date(end.getTime() - DEFAULT_DAYS[period] * 86_400_000);
  const rows = await Order.aggregate([
    { $match: { paymentStatus: { $in: ["paid", "partially_refunded", "refunded"] }, createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: { $dateToString: { format: FORMAT[period], timezone: "Asia/Kolkata", date: { $dateTrunc: { date: "$createdAt", unit: UNIT[period], timezone: "Asia/Kolkata", startOfWeek: "monday" } } } }, orders: { $sum: 1 }, gross: { $sum: "$grandTotal" }, discounts: { $sum: "$discountTotal" }, shipping: { $sum: "$shippingTotal" }, tax: { $sum: "$taxTotal" }, refunded: { $sum: "$amountRefunded" }, paid: { $sum: "$amountPaid" } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ period: r._id as string, orders: r.orders, gross: r.gross, discounts: r.discounts, shipping: r.shipping, tax: r.tax, refunded: r.refunded, net: r.paid - r.refunded }));
}

const rupees = (minor: number) => (minor / 100).toFixed(2);
export function reportCsv(rows: ReportRow[]): string {
  const head = "Period,Orders,Gross sales (INR),Discounts (INR),Shipping (INR),Tax (INR),Refunded (INR),Net revenue (INR)";
  const body = rows.map((r) => [r.period, r.orders, rupees(r.gross), rupees(r.discounts), rupees(r.shipping), rupees(r.tax), rupees(r.refunded), rupees(r.net)].join(","));
  const sum = (k: Exclude<keyof ReportRow, "period">) => rows.reduce((s, r) => s + r[k], 0);
  const total = ["TOTAL", sum("orders"), rupees(sum("gross")), rupees(sum("discounts")), rupees(sum("shipping")), rupees(sum("tax")), rupees(sum("refunded")), rupees(sum("net"))].join(",");
  return `\uFEFF${[head, ...body, total].join("\r\n")}\r\n`;
}
