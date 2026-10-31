# PetBlitz – operations, security & go-live

## 1. First-time setup (new machine / new environment)
1. `npm install`; copy `.env.example` → `.env.local`, fill it (see §2). Keep your existing `.env`; add the new keys.
2. `npm run db:verify` → `npm run db:indexes:dry` → `npm run db:indexes` (**required**: creates the new text-search and TTL indexes) → `npm run db:seed:categories`.
3. Create the first owner: `npm run admin:create -- --email you@petblitz.in --name "Your Name"` (prints a one-time password if `ADMIN_BOOTSTRAP_PASSWORD` is unset).
4. `npm run dev` → open `/admin/login` → sign in → **My account & security → set up MFA** → then set `ADMIN_API_KEY_ENABLED=false` (production) and `ADMIN_REQUIRE_MFA=true`.
5. Admin → **Store settings**: shipping fee / free-shipping threshold / state fees, GST mode, seller state + GSTIN + legal name + address, return window.
6. Admin → Categories / Pets / Products: add catalog (images upload to Cloudinary), set GST rate + HSN per item, publish.

## 2. Environment variables
See `.env.example` (every variable is documented there). Required for each feature: **Admin login** → `SESSION_SECRET`; **customer Google sign-in** → `GOOGLE_CLIENT_ID` + `SESSION_SECRET` + `APP_ORIGIN` (add `http://localhost:3000` and your domain under *Authorized JavaScript origins* in Google Cloud); **payments** → `RAZORPAY_*`; **images** → `CLOUDINARY_*`; **e-mail** → `SMTP_*` (until set, mails queue in `email_outbox` and are sent once SMTP is configured); **scheduler** → `CRON_SECRET`.

## 3. Scheduler (every 5 minutes) — required
`runMaintenance()` cancels unpaid orders past `RESERVATION_TTL_MINUTES` (frees stock, pets and coupon uses), finalises stuck wallet refunds, and **sends queued e-mails**. Idempotent and overlap-safe. Run ONE of:
* server cron: `*/5 * * * * cd /srv/petblitz && npm run db:release-expired >> /var/log/petblitz-maintenance.log 2>&1`
* HTTP scheduler (GitHub Actions `schedule`, cron-job.org, QStash): `curl -fsS -X POST https://petblitz.in/api/cron/release-expired -H "Authorization: Bearer $CRON_SECRET"` (POST only; Vercel Cron is GET-only so cannot call it directly).
Alert if it has not succeeded for 15 minutes.

## 4. Razorpay test-mode checklist (before live keys)
1. Test keys + webhook secret; webhook URL `https://<domain>/api/webhooks/razorpay` (tunnel locally) with events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`; auto-capture ON.
2. Checkout → pay with a test card/UPI → order `paid`, stock committed, confirmation e-mail queued.
3. Resend the same webhook → no change. Tamper with the body → 400.
4. Pay then cancel (customer, before processing) → wallet credited once; stock restored.
5. Admin refund to **original** method → `refund.processed` finalises it; force a failure → amount released.
6. Refund created in the Razorpay dashboard → recorded once.
7. Wallet top-up → credited once even with duplicate events.
8. Pay the same order by wallet and Razorpay → one settles, the other is refunded to the wallet.
9. Verify the razorpay-test.html helper is NOT deployed (see §7).

## 5. What is built vs. still needed
**Built & covered by tests:** admin accounts with 5 roles, server-side sessions, lockout, TOTP MFA + recovery codes, CSRF origin check, full audit log; RBAC policy table (unknown admin routes are owner-only by default); settings-driven shipping and GST (inclusive/exclusive, CGST/SGST/IGST), GST invoices per financial year; server cart; coupons (atomic usage limits, per-customer limits, release on cancel); returns workflow; privacy export/delete; e-mail outbox; stock movement log; text search; security headers + CSP; CI workflow.
**Not built (needs your decision or an external provider):**
* **Phone/OTP verification** — needs an SMS provider (e.g. MSG91, Twilio). Phone is collected but not verified.
* **Courier integration** (Shiprocket/Delhivery label + live tracking) — tracking is entered manually by admins.
* **Wallet withdrawal to bank** — deliberately not offered (RBI/PPI considerations); wallet is spend-only.
* **Error tracking / APM** (e.g. Sentry) — add the SDK and DSN; logs are structured to stdout without bodies.
* **Server-rendered product pages / sitemap / structured data** — storefront pages fetch client-side; for SEO convert detail pages to server components and add `sitemap.ts`.
* **Terms, privacy policy, shipping & cancellation pages** — legal text must come from you/your lawyer.
* **Selling live animals online** — check state/central rules (pet-shop registration, Prevention of Cruelty to Animals rules, age/health certification) before launch; the code gates returns for pets but does not encode legal compliance.

## 6. Verification status (be precise)
Automated here: type-check, lint, production build, **480 unit/route tests** (every endpoint's auth/validation/status, RBAC, MFA/TOTP RFC vectors, CSRF, sessions, rate limiter, GST/coupon/shipping maths, e-mail escaping), live smoke test of the built server with the database unreachable.
**Not run here (no MongoDB/Google/Razorpay/Cloudinary/SMTP/browser in the build sandbox):** the database tests (`npm run test:db`, incl. `tests/database/v2-flows.test.ts` for admin auth, cart, coupons, invoices, returns, privacy, outbox, and the Razorpay refund-webhook regression tests), live Google sign-in, Razorpay payments/refunds, Cloudinary uploads, SMTP delivery, Upstash, and **visual/browser testing of the UI** (layout, responsiveness, accessibility audit). Treat the frontend as built-and-compiling, not yet user-tested.

## 7. Files that must not ship
* `public/razorpay-test.html` (developer payment test page with a test key id) — removed from this delivery; keep it out of production builds.
* Stray zero-byte files named `({`, `cls`, `type` in the repo root — delete them.
* Never commit `.env*`.

## 8. Security posture & remaining risks
* Admin auth: per-person accounts, scrypt, lockout, session revocation, optional enforced MFA, role least-privilege, audit trail. Remaining: no IP allow-listing, no WebAuthn/passkeys, no password-breach (HIBP) check, single-region sessions.
* Customer sessions are custom signed tokens (HttpOnly, SameSite=Lax, CSRF origin check, status re-check per request). No server-side revocation list; consider Auth.js DB sessions (`setCustomerAuthResolver` is the hook).
* CSP allows `'unsafe-inline'` scripts (Next.js bootstrap); tighten with nonces later.
* Email/HTML: content stored as text and escaped at render; templates escape every value.
* Rate limits are per-IP; set `UPSTASH_*` for shared limits across instances.
* GST: tax maths is configurable but **not tax advice** — confirm rates/HSN/inclusive pricing/shipping tax with your accountant. Shipping is shown at 0% tax on invoices.
* Atlas: dedicated prod user, IP allow-list, continuous backups with a tested restore, alerts (connections, slow queries, failed logins, scheduler heartbeat).
