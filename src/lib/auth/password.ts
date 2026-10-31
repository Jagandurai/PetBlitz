import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** scrypt (memory-hard, built into Node: no native dependency). Format: scrypt$N$r$p$saltB64$hashB64 */
const N = 2 ** 15, R = 8, P = 1, KEYLEN = 64;
const opts = { N, r: R, p: P, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, opts);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Equalises login timing when the e-mail does not exist (no user enumeration). */
export const DUMMY_HASH = hashPassword("dummy-password-for-timing");

const COMMON = ["password", "123456789012", "qwertyuiop12", "iloveyou1234", "administrator", "welcome12345"];
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (password.length > 128) return "Password is too long";
  if (COMMON.some((c) => password.toLowerCase().includes(c))) return "Password is too common";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return "Password must not contain your e-mail name";
  if (!/[a-z]/.test(password) || !/[A-Z0-9]/.test(password)) return "Use a mix of lowercase letters and capitals or digits";
  return null;
}
