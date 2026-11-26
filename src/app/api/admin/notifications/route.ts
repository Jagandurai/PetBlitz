import { can } from "@/lib/auth/rbac";
import { ok } from "@/lib/http";
import { adminSelf } from "@/lib/route";
import { countUnreadTicketsAdmin } from "@/services/message.service";
import { countUnreadOrdersAdmin } from "@/services/order.service";
import { countUnreadReviewsAdmin } from "@/services/review.service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Unread counts for the sidebar. Open to every role, but each count needs that role's read permission. */
export const GET = adminSelf(async ({ actor }) => {
  const allowed = !actor.mfaSetupRequired;
  const [orders, tickets, reviews] = await Promise.all([
    allowed && can(actor.role, "orders.read") ? countUnreadOrdersAdmin() : 0,
    allowed && can(actor.role, "support.read") ? countUnreadTicketsAdmin() : 0,
    allowed && can(actor.role, "support.read") ? countUnreadReviewsAdmin() : 0,
  ]);
  return ok({ orders, tickets, reviews });
});
