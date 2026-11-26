import { customer, idOf } from "@/lib/route";
import { ok } from "@/lib/http";
import { getInvoiceForCustomer } from "@/services/invoice.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GST tax invoice (issued when the order ships). 404 until issued. The storefront renders it as a printable page. */
export const GET = customer<{ id: string }>(async ({ me, params }) => ok(await getInvoiceForCustomer(me.customerId, idOf(params.id))));
