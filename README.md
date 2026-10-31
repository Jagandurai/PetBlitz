# PetBlitz — Next.js storefront + Admin Portal + API (MongoDB Atlas)

* **Storefront** (`/`): home, pets & accessories with search/filters, cart, checkout (Razorpay / wallet), account (orders, GST invoices, wallet top-up, addresses, returns, support, privacy).
* **Admin Portal** (`/admin`): dashboard, categories (dynamic tree), pets, products (Cloudinary images, stock), orders (status, shipping, refunds), customers & wallet, coupons, returns, reviews, support tickets, store settings (shipping + GST), admins & roles, audit log, MFA.
* **API**: ~120 endpoints, see `docs/API.md` (generated). Ops/security/go-live: `docs/OPERATIONS.md`. Data model: `docs/DATABASE.md`.

## Quick start
```bash
npm install
cp .env.example .env.local          # fill MONGODB_URI, SESSION_SECRET, ADMIN_API_KEY, GOOGLE_CLIENT_ID, ... (keep your existing .env)
npm run db:verify && npm run db:indexes && npm run db:seed:categories
npm run admin:create -- --email you@petblitz.in --name "You"
npm run dev                         # storefront http://localhost:3000  ·  admin http://localhost:3000/admin/login
```

## Scripts
`typecheck` · `lint` · `build` · `test:unit` (480 tests, no DB) · `test:db` (needs `MONGODB_TEST_URI`, db `PetBlitzTest`) · `db:indexes` · `db:release-expired` (cron, every 5 min) · `admin:create` · `auth:dev-token -- <customerId>` (dev: API testing without Google) · `docs:generate` (API docs + Thunder Client collection).

## Thunder Client
Import `thunder-client/thunder-collection_PetBlitz.json` and `thunder-client/thunder-environment_PetBlitz.json`; placeholders only.
