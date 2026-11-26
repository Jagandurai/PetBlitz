import { connectDB } from "@/lib/db/connection";
import { Banner, BannerDocShape } from "@/models/Banner";
import { BANNER_SLOTS, BannerInput, bannerSchema, bannerSlotSchema } from "@/validations/homepage.validation";

export interface BannerSlot extends BannerInput { slot: number; updatedAt: string | null }

/** The parts of a record from the earlier advanced editor that are still needed to show it. */
interface LegacyImage { url?: string; storageKey?: string }
interface LegacyBanner {
  isActive?: boolean;
  live?: {
    slot?: number; order?: number; startsAt?: string | null; endsAt?: string | null;
    design?: {
      format?: string;
      images?: { desktop?: LegacyImage | null; tablet?: LegacyImage | null; mobile?: LegacyImage | null };
      content?: { heading?: string; highlight?: string; paragraph?: string; showHeading?: boolean; showParagraph?: boolean };
    };
  } | null;
}
export type StoredBanner = Omit<BannerDocShape, "_id" | "createdAt" | "updatedAt"> & LegacyBanner & { _id?: unknown; updatedAt?: Date };

const isSimple = (r: StoredBanner) => typeof r.heading === "string";

/** True when the earlier editor's record was on the storefront at `now` (published, active, in schedule). */
function wasShowing(r: StoredBanner, now: Date) {
  const l = r.live;
  return !!l && r.isActive !== false && !(l.startsAt && new Date(l.startsAt) > now) && !(l.endsAt && new Date(l.endsAt) <= now);
}

/** The one record that represents each slot: a saved simple record, otherwise the old banner that was shown first. */
export function currentBySlot(rows: StoredBanner[], now = new Date()): Map<number, StoredBanner> {
  const out = new Map<number, StoredBanner>();
  for (const r of rows.filter(isSimple)) out.set(r.slot, r);
  const old = rows.filter((r) => !isSimple(r) && wasShowing(r, now)).sort((a, b) => (a.live?.order ?? 0) - (b.live?.order ?? 0));
  for (const r of old) { const slot = r.live?.slot ?? r.slot; if (!out.has(slot)) out.set(slot, r); }
  return out;
}

export function toBannerSlot(slot: number, r?: StoredBanner): BannerSlot {
  const updatedAt = r?.updatedAt ? new Date(r.updatedAt).toISOString() : null;
  if (!r) return { slot, heading: "", paragraph: "", imageUrl: "", imageKey: "", updatedAt };
  if (isSimple(r)) return { slot, heading: r.heading ?? "", paragraph: r.paragraph ?? "", imageUrl: r.imageUrl ?? "", imageKey: r.imageKey ?? "", updatedAt };
  const d = r.live?.design, image = d?.images?.desktop ?? d?.images?.tablet ?? d?.images?.mobile;
  const words = d?.format === "image" ? undefined : d?.content;
  return {
    slot,
    heading: words && words.showHeading !== false ? [words.heading, words.highlight].filter(Boolean).join(" ") : "",
    paragraph: words && words.showParagraph !== false ? words.paragraph ?? "" : "",
    imageUrl: image?.url ?? "", imageKey: image?.storageKey ?? "", updatedAt,
  };
}

const load = async () => { await connectDB(); return (await Banner.find().sort({ createdAt: 1 }).limit(500).lean()) as unknown as StoredBanner[]; };

/** All four positions, empty ones included. Used by both the storefront and the admin page. */
export async function getBannerSlots(): Promise<BannerSlot[]> {
  const current = currentBySlot(await load());
  return BANNER_SLOTS.map((n) => toBannerSlot(n, current.get(n)));
}

/** Updates one position. It is on the storefront as soon as this returns. */
export async function saveBanner(slot: number, input: BannerInput): Promise<BannerSlot> {
  const n = bannerSlotSchema.parse(slot);
  const data = bannerSchema.parse(input);
  const existing = currentBySlot(await load()).get(n);
  if (existing) await Banner.updateOne({ _id: existing._id }, { $set: { slot: n, ...data } });
  else await Banner.create({ slot: n, ...data });
  return (await getBannerSlots())[n - 1]!;
}
