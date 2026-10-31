import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { isDuplicateKeyError, notFound } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { fiscalYear, splitGst, stateCodeOf } from "@/lib/gst";
import { nextSequence } from "@/lib/sequence";
import { Invoice, InvoiceDoc } from "@/models/Ops";
import { Order } from "@/models/Order";
import { getSettings } from "./settings.service";

/**
 * GST tax invoice for an order. One per order (unique index) - re-running returns the existing one. Issued when the order ships
 * (time of supply for goods). Intra-state => CGST+SGST, inter-state => IGST, decided from the seller state in Settings and the
 * order's place of supply. Shipping is shown separately at 0% tax (ACCOUNTANT TO CONFIRM; see docs/OPERATIONS.md).
 */
export async function ensureInvoice(orderId: string | Types.ObjectId): Promise<InvoiceDoc> {
  await connectDB();
  const oid = toObjectId(orderId);
  const existing = await Invoice.findOne({ orderId: oid }).lean();
  if (existing) return existing as unknown as InvoiceDoc;
  const order = await Order.findById(oid).lean();
  if (!order) throw notFound("Order");
  const settings = await getSettings();
  const seller = settings.tax;
  const place = order.placeOfSupply ?? stateCodeOf(order.shippingAddress?.state) ?? "";
  const issuedAt = new Date();
  const fy = fiscalYear(issuedAt);

  const lines = order.items.map((it) => {
    const gst = splitGst(it.taxAmount, seller.sellerStateCode, place);
    return { description: it.name, hsnCode: (it as { hsnCode?: string }).hsnCode, quantity: it.quantity, taxableValue: it.lineTotal - it.taxAmount, taxRateBps: it.taxRateBps, ...gst, total: it.lineTotal };
  });
  const totals = {
    taxable: lines.reduce((a, l) => a + l.taxableValue, 0), cgst: lines.reduce((a, l) => a + l.cgst, 0), sgst: lines.reduce((a, l) => a + l.sgst, 0), igst: lines.reduce((a, l) => a + l.igst, 0),
    grandTotal: order.grandTotal,
  };
  const addr = (a?: { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postalCode?: string | null }) => [a?.line1, a?.line2, a?.city, a?.state, a?.postalCode].filter(Boolean).join(", ");
  try {
    const inv = await Invoice.create({
      invoiceNumber: `${seller.invoicePrefix}/${fy}/${String(await nextSequence(`invoice:${fy}`)).padStart(6, "0")}`,
      orderId: oid, customerId: order.customerId, fiscalYear: fy, issuedAt, placeOfSupply: place, pricesIncludeTax: order.pricesIncludeTax,
      seller: { legalName: seller.legalName, gstin: seller.sellerGstin, address: seller.address, stateCode: seller.sellerStateCode },
      buyer: { name: order.billingAddress?.recipientName ?? order.customerSnapshot?.name, email: order.customerSnapshot?.email, address: addr(order.billingAddress), stateCode: stateCodeOf(order.billingAddress?.state) },
      lines, shipping: order.shippingTotal, totals,
    });
    return inv.toObject() as unknown as InvoiceDoc;
  } catch (e) {
    if (isDuplicateKeyError(e)) return (await Invoice.findOne({ orderId: oid }).lean()) as unknown as InvoiceDoc; // concurrent issue: use the winner
    throw e;
  }
}

export async function getInvoiceForCustomer(customerId: string, orderId: string) {
  await connectDB();
  const inv = await Invoice.findOne({ orderId: toObjectId(orderId), customerId: toObjectId(customerId) }).lean();
  if (!inv) throw notFound("Invoice"); // not issued yet, or not yours
  return inv;
}
