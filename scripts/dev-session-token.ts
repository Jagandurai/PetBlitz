import "./_env";
import { signSession } from "@/lib/auth/session";

// DEV ONLY: mint a customer session token for API testing (Thunder Client) without Google sign-in.
// Usage: npm run auth:dev-token -- <customerObjectId>
if (process.env.NODE_ENV === "production") { console.error("Refusing to run in production"); process.exit(1); }
const id = process.argv[2];
if (!id || !/^[a-f\d]{24}$/i.test(id)) { console.error("Usage: npm run auth:dev-token -- <24-hex customer id>"); process.exit(1); }
try { console.log(signSession(id)); } catch (e) { console.error(e instanceof Error ? e.message : "failed (is SESSION_SECRET set?)"); process.exit(1); }
