import { ok } from "@/lib/http";
import { customer } from "@/lib/route";
import { countUnreadTicketsCustomer } from "@/services/message.service";
import { countUnreadOrdersCustomer } from "@/services/order.service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Unread counts for the signed-in customer only. */
export const GET = customer(async ({ me }) => {
  const [orders, tickets] = await Promise.all([countUnreadOrdersCustomer(me.customerId), countUnreadTicketsCustomer(me.customerId)]);
  return ok({ orders, tickets });
}, { limit: 240 });
