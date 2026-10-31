import { z } from "zod";
import { AppError } from "./errors";

const schema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().min(1).default("PetBlitz"),
  CATEGORY_MAX_DEPTH: z.coerce.number().int().min(1).max(10).default(3),
  RESERVATION_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  SHIPPING_FLAT_MINOR: z.coerce.number().int().min(0).default(0),
  ADMIN_API_KEY: z.string().min(32).optional(),
  ADMIN_API_KEY_ENABLED: z.enum(["true", "false"]).default("true"), // set "false" in production once real admin accounts exist
  ADMIN_REQUIRE_MFA: z.enum(["true", "false"]).default("false"),
  ADMIN_SESSION_HOURS: z.coerce.number().int().min(1).max(72).default(8),
  ADMIN_IDLE_MINUTES: z.coerce.number().int().min(5).max(480).default(15),
  RETURN_WINDOW_DAYS: z.coerce.number().int().min(0).max(60).default(7),
  CRON_SECRET: z.string().min(32).optional(), // bearer secret for the scheduler endpoint (NOT the admin key)
  APP_ORIGIN: z.string().url().optional(), // e.g. https://petblitz.in - used for CSRF origin checks
  SESSION_SECRET: z.string().min(32).optional(), // signs customer session tokens
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  WALLET_TOPUP_MIN_MINOR: z.coerce.number().int().min(100).default(10_000),
  WALLET_TOPUP_MAX_MINOR: z.coerce.number().int().min(100).default(5_000_000),
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

const blankToUndefined = (v: string | undefined) => (v && v.trim() !== "" ? v : undefined);

export function getEnv(): Env {
  if (cached) return cached;
  const raw: Record<string, string | undefined> = {};
  for (const k of Object.keys(schema.shape)) raw[k] = blankToUndefined(process.env[k]);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Only variable NAMES are reported, never values.
    const names = parsed.error.issues.map((i) => i.path.join("."));
    throw new AppError("CONFIG_ERROR", 500, "Invalid server configuration", { variables: names });
  }
  cached = parsed.data;
  return cached;
}

/** Test helper only. */
export function resetEnvCache() {
  cached = undefined;
}

export function missingEnvNames(): string[] {
  return ["MONGODB_URI", "MONGODB_DB_NAME", "ADMIN_API_KEY", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"].filter(
    (k) => !blankToUndefined(process.env[k]),
  );
}
