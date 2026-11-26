/**
 * The one place that knows the order progress stages. Safe to import in browser and server code.
 * Orders are moved by hand by the PetBlitz team: there is no courier integration and nothing advances with time.
 */
export const ORDER_STAGES = [
  { key: "placed", label: "Order Placed", description: "Your order has been placed successfully." },
  { key: "accepted", label: "Accepted", description: "Your order has been accepted by the PetBlitz team." },
  { key: "packed", label: "Packed", description: "Your order has been packed and is ready for dispatch." },
  { key: "dispatched", label: "Dispatched", description: "Your order has been handed over to our delivery partner." },
  { key: "in_transit", label: "On the Way", description: "Your order is on its way to your delivery address." },
  { key: "delivered", label: "Delivered", description: "Your order has been delivered successfully." },
] as const;

export const TRACKING_NOTE = "Order status is updated by the PetBlitz team. For real-time shipment updates, please use the courier tracking link when available.";

export type StageKey = (typeof ORDER_STAGES)[number]["key"];
export const STAGE_KEYS = ORDER_STAGES.map((s) => s.key) as StageKey[];

/**
 * Statuses of the earlier eight-stage flow. Stored records are never rewritten; they are read as the stage on the right.
 * "processing" is deliberately NOT "packed": packing may not have happened.
 */
export const LEGACY_STATUS_MAP: Record<string, StageKey> = { confirmed: "accepted", processing: "accepted", shipped: "dispatched", out_for_delivery: "in_transit" };

export const normalizeStatus = (s: string): string => LEGACY_STATUS_MAP[s] ?? s;
/** Every stored value that means this status (for database filters). */
export const storedStatusesFor = (s: string): string[] => {
  const k = normalizeStatus(s);
  return [k, ...Object.keys(LEGACY_STATUS_MAP).filter((l) => LEGACY_STATUS_MAP[l] === k)];
};
/** Admin list filter / dashboard queue: accepted or packed, not yet with the courier. */
export const TO_SHIP_STATUSES = [...storedStatusesFor("accepted"), "packed"];
/** Handed to the courier or later (an invoice exists from here on). */
export const SHIPPED_STAGES: string[] = ["dispatched", "in_transit", "delivered"];

const EXTRA_LABELS: Record<string, string> = { cancelled: "Cancelled", refund_initiated: "Refund initiated", refunded: "Refunded", shipping_updated: "Courier details updated", to_ship: "To pack / dispatch" };
export function orderStatusLabel(s: string): string {
  const k = normalizeStatus(s);
  return ORDER_STAGES.find((x) => x.key === k)?.label ?? EXTRA_LABELS[k] ?? k.replace(/_/g, " ");
}

export const stageIndex = (s: string) => STAGE_KEYS.indexOf(normalizeStatus(s) as StageKey);
/** The single forward step an admin may take from here; null after delivery and for cancelled / refund states. */
export const nextStage = (s: string): StageKey | null => {
  const i = stageIndex(s);
  return i < 0 ? null : STAGE_KEYS[i + 1] ?? null;
};

/**
 * When a stage was really reached, from the recorded history only. A stage with no record gets no time (never invented).
 * An entry under the current name wins over a legacy one.
 */
export function stageTime(stage: StageKey, history: { to: string; at: string }[], createdAt?: string): string | undefined {
  const hit = history.find((h) => h.to === stage) ?? history.find((h) => normalizeStatus(h.to) === stage);
  return hit?.at ?? (stage === "placed" ? createdAt : undefined);
}

/** Only absolute http(s) links may be stored or opened. */
export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname;
  } catch {
    return false;
  }
}

/** How far a return got, taken from the order's return requests (a return does not change the order's own status). */
export interface ReturnInfo { status: "requested" | "approved" | "received" | "refunded"; at?: string | Date }
interface ReturnLike { status: string; createdAt?: string | Date; history?: { status?: string | null; at?: string | Date | null }[] }
const RETURN_STEPS: ReturnInfo["status"][] = ["requested", "approved", "received", "refunded"];

/** The furthest live return. Rejected requests, and ones closed before the item came back, do not count. */
export function returnProgress(returns: ReturnLike[]): ReturnInfo | undefined {
  let best = -1, at: string | Date | undefined;
  for (const r of returns) {
    if (r.status === "rejected") continue;
    const has = (s: string) => r.status === s || !!r.history?.some((h) => h.status === s);
    const rank = has("refunded") ? 3 : has("received") ? 2 : r.status === "approved" ? 1 : r.status === "requested" ? 0 : -1;
    if (rank <= best) continue;
    best = rank;
    at = r.history?.find((h) => h.status === RETURN_STEPS[rank])?.at ?? r.createdAt;
  }
  return best < 0 ? undefined : { status: RETURN_STEPS[best]!, at };
}

const RETURN_TEXT: Record<ReturnInfo["status"], [string, string]> = {
  requested: ["Return Requested", "A return has been requested for this order."],
  approved: ["Return Approved", "The return request for this order has been approved."],
  received: ["Returned", "The returned item has been received by the PetBlitz team."],
  refunded: ["Return Refunded", "The returned item has been refunded."],
};

export interface TimelineStep { key: string; label: string; state: "done" | "cur" | "next" | "stop"; at?: string }

/**
 * The steps to draw. A cancelled, returned or refunded order shows only what was really reached and then ends in one
 * "stop" step (drawn in red): no later stages.
 */
export function buildTimeline(status: string, history: { from?: string | null; to: string; at: string }[], createdAt: string, returned?: ReturnInfo): { steps: TimelineStep[]; stop?: TimelineStep & { description: string } } {
  const cancel = history.find((h) => h.to === "cancelled");
  const idx = stageIndex(status);
  const step = (i: number, state: TimelineStep["state"]): TimelineStep => ({ key: ORDER_STAGES[i]!.key, label: ORDER_STAGES[i]!.label, state, at: stageTime(ORDER_STAGES[i]!.key, history, createdAt) });
  const ended = (last: number, key: string, label: string, description: string, at?: string) => {
    const stop = { key, label, description, at, state: "stop" as const };
    return { steps: [...ORDER_STAGES.slice(0, last + 1).map((_, i) => step(i, "done")), stop], stop };
  };
  const delivered = STAGE_KEYS.length - 1;
  if (status === "cancelled" || (idx < 0 && cancel)) {
    // the furthest stage the order had reached when it was cancelled
    const last = Math.max(0, ...history.flatMap((h) => [stageIndex(h.to), stageIndex(h.from ?? "")]));
    const refund = status === "refunded" ? " The refund is complete." : status === "refund_initiated" ? " A refund has been started." : "";
    return ended(last, "cancelled", "Cancelled", `This order was cancelled after the "${ORDER_STAGES[last]!.label}" stage.${refund}`, cancel?.at);
  }
  if (returned && (status === "delivered" || idx < 0)) {
    const [label, description] = RETURN_TEXT[returned.status];
    return ended(delivered, "returned", label, description, returned.at ? new Date(returned.at).toISOString() : undefined);
  }
  if (idx < 0) return ended(delivered, status, orderStatusLabel(status).replace(/^./, (c) => c.toUpperCase()), "A refund applies to this order.", history.find((h) => h.to === status)?.at);
  const steps = ORDER_STAGES.map((_, i) => {
    const s = step(i, i < idx || idx === delivered ? "done" : i === idx ? "cur" : "next");
    return i > idx ? { ...s, at: undefined } : s; // no time on a stage that has not been reached
  });
  return { steps };
}
