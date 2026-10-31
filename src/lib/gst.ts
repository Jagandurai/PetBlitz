/** GST state / UT codes (used for place of supply: same state => CGST+SGST, different state => IGST). */
export const GST_STATES: { code: string; name: string; abbr: string }[] = [
  ["01", "Jammu and Kashmir", "JK"], ["02", "Himachal Pradesh", "HP"], ["03", "Punjab", "PB"], ["04", "Chandigarh", "CH"], ["05", "Uttarakhand", "UK"], ["06", "Haryana", "HR"],
  ["07", "Delhi", "DL"], ["08", "Rajasthan", "RJ"], ["09", "Uttar Pradesh", "UP"], ["10", "Bihar", "BR"], ["11", "Sikkim", "SK"], ["12", "Arunachal Pradesh", "AR"],
  ["13", "Nagaland", "NL"], ["14", "Manipur", "MN"], ["15", "Mizoram", "MZ"], ["16", "Tripura", "TR"], ["17", "Meghalaya", "ML"], ["18", "Assam", "AS"],
  ["19", "West Bengal", "WB"], ["20", "Jharkhand", "JH"], ["21", "Odisha", "OD"], ["22", "Chhattisgarh", "CG"], ["23", "Madhya Pradesh", "MP"], ["24", "Gujarat", "GJ"],
  ["26", "Dadra and Nagar Haveli and Daman and Diu", "DD"], ["27", "Maharashtra", "MH"], ["29", "Karnataka", "KA"], ["30", "Goa", "GA"], ["31", "Lakshadweep", "LD"],
  ["32", "Kerala", "KL"], ["33", "Tamil Nadu", "TN"], ["34", "Puducherry", "PY"], ["35", "Andaman and Nicobar Islands", "AN"], ["36", "Telangana", "TS"],
  ["37", "Andhra Pradesh", "AP"], ["38", "Ladakh", "LA"],
].map(([code, name, abbr]) => ({ code: code!, name: name!, abbr: abbr! }));

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
const INDEX = new Map<string, string>();
for (const s of GST_STATES) { INDEX.set(norm(s.name), s.code); INDEX.set(norm(s.abbr), s.code); INDEX.set(s.code, s.code); }
INDEX.set("orissa", "21"); INDEX.set("pondicherry", "34"); INDEX.set("uttaranchal", "05"); INDEX.set("andhrapradesh", "37");

/** "Tamil Nadu" | "TN" | "33" -> "33"; undefined when it cannot be resolved. */
export const stateCodeOf = (input?: string | null): string | undefined => (input ? INDEX.get(norm(input)) ?? INDEX.get(input.trim()) : undefined);

/** Split a tax amount (paise) into GST components. Intra-state: CGST+SGST (halves, remainder to SGST); inter-state: IGST. */
export function splitGst(taxMinor: number, sellerState?: string, placeOfSupply?: string) {
  if (sellerState && placeOfSupply && sellerState === placeOfSupply) {
    const cgst = Math.floor(taxMinor / 2);
    return { cgst, sgst: taxMinor - cgst, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: taxMinor };
}

/** Indian financial year label for a date: 2026-04-01..2027-03-31 => "2026-27". */
export function fiscalYear(d: Date): string {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
