import { connectDB } from "@/lib/db/connection";
import { getEnv } from "@/lib/env";
import { StoreSettings } from "@/models/Store";
import { SettingsInput, settingsSchema } from "@/validations/settings.validation";

export interface EffectiveSettings {
  shipping: { baseFeeMinor: number; freeAboveMinor: number | null; stateFees: Record<string, number> };
  tax: { pricesIncludeTax: boolean; sellerStateCode?: string; sellerGstin?: string; legalName?: string; address?: string; invoicePrefix: string };
  returns: { windowDays: number; petsReturnable: boolean };
}

let cache: { at: number; value: EffectiveSettings } | null = null;
const TTL_MS = 30_000;

/** DB settings (admin-editable) over env defaults. Cached 30 s per instance. */
export async function getSettings(force = false): Promise<EffectiveSettings> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  await connectDB();
  const env = getEnv();
  const d = await StoreSettings.findById("main").lean();
  const value: EffectiveSettings = {
    shipping: { baseFeeMinor: d?.shipping?.baseFeeMinor ?? env.SHIPPING_FLAT_MINOR, freeAboveMinor: d?.shipping?.freeAboveMinor ?? null, stateFees: d?.shipping?.stateFees ? Object.fromEntries(Object.entries(d.shipping.stateFees as unknown as Record<string, number>)) : {} },
    tax: { pricesIncludeTax: d?.tax?.pricesIncludeTax ?? false, sellerStateCode: d?.tax?.sellerStateCode ?? undefined, sellerGstin: d?.tax?.sellerGstin || undefined, legalName: d?.tax?.legalName ?? undefined, address: d?.tax?.address ?? undefined, invoicePrefix: d?.tax?.invoicePrefix ?? "PB" },
    returns: { windowDays: d?.returns?.windowDays ?? env.RETURN_WINDOW_DAYS, petsReturnable: d?.returns?.petsReturnable ?? false },
  };
  cache = { at: Date.now(), value };
  return value;
}

export async function updateSettings(input: SettingsInput, actorId: string): Promise<EffectiveSettings> {
  await connectDB();
  const d = settingsSchema.parse(input);
  const $set: Record<string, unknown> = { updatedBy: actorId };
  const $unset: Record<string, 1> = {};
  for (const [group, vals] of Object.entries(d)) for (const [k, v] of Object.entries(vals ?? {})) {
    if (v === null) $unset[`${group}.${k}`] = 1; else $set[`${group}.${k}`] = v;
  }
  await StoreSettings.updateOne({ _id: "main" }, { $set, ...(Object.keys($unset).length ? { $unset } : {}) }, { upsert: true });
  cache = null;
  return getSettings(true);
}

/** Customer-safe subset for the storefront (no GSTIN/address). */
export async function getPublicSettings() {
  const s = await getSettings();
  return { currency: "INR", googleClientId: process.env.GOOGLE_CLIENT_ID ?? null, pricesIncludeTax: s.tax.pricesIncludeTax, shipping: { baseFeeMinor: s.shipping.baseFeeMinor, freeAboveMinor: s.shipping.freeAboveMinor }, returns: s.returns };
}
export const _clearSettingsCache = () => { cache = null; };
