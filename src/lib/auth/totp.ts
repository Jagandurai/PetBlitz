import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

/** RFC 6238 TOTP (HMAC-SHA1, 30 s step, 6 digits) - compatible with Google Authenticator, Authy, 1Password, etc. */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const base32Encode = (buf: Buffer): string => {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};
export const base32Decode = (s: string): Buffer => {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) { const i = B32.indexOf(ch); if (i < 0) throw new Error("bad base32"); value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
};

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function totpAt(secretB32: string, timeMs: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 1000 / 30)));
  const h = createHmac("sha1", base32Decode(secretB32)).update(counter).digest();
  const off = h[h.length - 1]! & 0xf;
  const code = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(code % 10 ** digits).padStart(digits, "0");
}

/** Accepts the previous/current/next step (clock drift). */
export function verifyTotp(secretB32: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let ok = false;
  for (const drift of [-30_000, 0, 30_000]) {
    const expected = Buffer.from(totpAt(secretB32, now + drift));
    if (expected.length === code.length && timingSafeEqual(expected, Buffer.from(code))) ok = true; // no early exit
  }
  return ok;
}

export const otpauthUrl = (email: string, secret: string) => `otpauth://totp/PetBlitz:${encodeURIComponent(email)}?secret=${secret}&issuer=PetBlitz&algorithm=SHA1&digits=6&period=30`;

// ---- encryption at rest for the TOTP secret (AES-256-GCM; key derived from SESSION_SECRET with a domain label)
function key(): Buffer {
  const s = getEnv().SESSION_SECRET;
  if (!s) throw new AppError("AUTH_NOT_CONFIGURED", 503, "SESSION_SECRET is not configured");
  return createHash("sha256").update(`petblitz:mfa:${s}`).digest();
}
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !enc) throw new AppError("MFA_CORRUPT", 500, "Stored MFA secret is unreadable");
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export const newRecoveryCodes = (n = 8) => Array.from({ length: n }, () => randomBytes(5).toString("hex").replace(/(.{5})(.{5})/, "$1-$2"));
export const hashRecovery = (code: string) => createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
