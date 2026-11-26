import "./_env";
import { randomBytes } from "node:crypto";
import { connectDB, disconnectDB } from "@/lib/db/connection";
import { createAdmin } from "@/services/admin-auth.service";
import { AdminUser } from "@/models/Admin";

/**
 * Bootstrap the FIRST owner (or add admins from the server shell).
 *   npm run admin:create -- --email owner@petblitz.in --name "Owner" [--role owner]
 * Password: ADMIN_BOOTSTRAP_PASSWORD from the environment, otherwise a strong one is generated and printed ONCE.
 * Afterwards: sign in at /admin/login, enable MFA, then set ADMIN_API_KEY_ENABLED=false in production.
 */
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
(async () => {
  if (process.argv.includes("--make-primary")) {
    // npm run admin:create -- --email owner@petblitz.in --make-primary  (flags an EXISTING admin as the primary owner)
    const em = arg("email")?.trim().toLowerCase();
    if (!em) { console.error("--email is required"); process.exit(1); }
    await connectDB();
    const r = await AdminUser.updateOne({ email: em }, { $set: { isPrimary: true, role: "owner", isActive: true } });
    console.log(r.matchedCount ? `${em} is now the primary owner` : `No admin found with e-mail ${em}`);
    await disconnectDB();
    return;
  }
  const email = arg("email"), name = arg("name") ?? "Owner", role = (arg("role") ?? "owner") as "owner";
  if (!email) { console.error('Usage: npm run admin:create -- --email you@petblitz.in --name "Your Name" [--role owner|catalog|orders|finance|support]'); process.exit(1); }
  await connectDB();
  if (role === "owner" && (await AdminUser.countDocuments({ role: "owner" })) > 0 && process.argv.indexOf("--force") === -1) { console.error("An owner already exists. Use the Admin Portal (Admins page) or pass --force."); process.exit(1); }
  const generated = !process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? `${randomBytes(12).toString("base64url")}-Aa1`;
  const a = await createAdmin({ email, name, role, password }, "bootstrap-script");
  console.log(`Created ${a.role} ${a.email}`);
  if (generated) console.log(`One-time password (change it after signing in): ${password}`);
  await disconnectDB();
})().catch(async (e) => { console.error("Failed:", e instanceof Error ? e.message : "unknown error"); await disconnectDB().catch(() => undefined); process.exit(1); });
