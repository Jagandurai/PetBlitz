# PetBlitz HTTP API

_Generated from `scripts/endpoints.ts` by `npm run docs:generate`. Do not edit by hand._

## Conventions
* Base URL `http://localhost:3000`. Bodies are JSON (max 100 KB). Money is **integer paise** (INR minor units).
* **Success:** `{ "success": true, "data": ... }` &nbsp; **Error:** `{ "success": false, "error": { "code": "...", "message": "...", "details"?: [...] } }`
* Status codes: 200/201 ok · 400 validation / bad JSON / bad id · 401 not authenticated · 403 forbidden / CSRF / suspended · 404 not found · 409 business-rule conflict · 413 body too large · 422 unprocessable rule · 429 rate limited · 503 dependency not configured/unavailable.
* **Admin auth:** `Authorization: Bearer <ADMIN_API_KEY>` (server-side only; never ship it to browsers). Checked before body parsing or any DB access.
* **Customer auth:** signed session — `pb_session` HttpOnly cookie (set by `POST /api/auth/google`) or `Authorization: Bearer <session token>`. Cookie-authenticated writes also require a matching `Origin` header (CSRF).
* **Scheduler auth:** `Authorization: Bearer <CRON_SECRET>`.

## Endpoints (116)

### Public

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | none | Liveness (no database). |
| GET | `/api/categories` | none | Public hierarchy: only active, visible, unarchived categories whose whole ancestor chain is eligible. |
| GET | `/api/categories?slug=labrador` | none | Category + children + breadcrumbs (old slugs redirect). |
| GET | `/api/pets?type=dog&sort=price_asc&page=1&pageSize=10` | none | Published pets (private fields never returned). |
| GET | `/api/pets/{{petSlug}}` | none | Single published pet. |
| GET | `/api/products?compatibility=dog&inStock=true` | none | Published accessories. |
| GET | `/api/products/{{productSlug}}` | none | Single published product. |
| GET | `/api/reviews?targetType=product&targetId={{productId}}` | none | Approved reviews only. |
| POST | `/api/contact` | none | Creates a support ticket. 5 requests / 10 min / IP. Honeypot field `website` must stay empty. |
| POST | `/api/webhooks/razorpay` | Razorpay signature | Razorpay -> server. Needs x-razorpay-signature (HMAC of RAW body) and x-razorpay-event-id headers. |
| POST | `/api/cron/release-expired` | Cron secret | Cancels unpaid orders past the TTL, frees reservations, finalises stuck wallet refunds. Bearer CRON_SECRET. |
| GET | `/api/settings/public` | none | Tax mode, shipping fee / free-shipping threshold, return window (no GSTIN or addresses). |

### Customer auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/google` | none | Exchange a Google ID token for an HttpOnly session cookie. Needs GOOGLE_CLIENT_ID + SESSION_SECRET. |
| POST | `/api/auth/logout` | none | Clears the session cookie. |

### Customer

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/me` | Customer session | Profile incl. wallet balance. |
| PATCH | `/api/me` | Customer session | Allow-listed fields only (status/role/email are rejected). |
| GET | `/api/me/addresses` | Customer session | Saved addresses. |
| POST | `/api/me/addresses` | Customer session | Max 10 addresses. |
| PATCH | `/api/me/addresses/{{addressId}}` | Customer session | Partial update. |
| DELETE | `/api/me/addresses/{{addressId}}` | Customer session | Removes the address and any default pointing at it. |
| POST | `/api/me/addresses/{{addressId}}/default` | Customer session | Default shipping and/or billing. |
| GET | `/api/me/wallet?page=1&pageSize=20` | Customer session | Balance (paise) and ledger statement. |
| POST | `/api/me/wallet/topup` | Customer session | Creates a Razorpay order. Wallet is credited only after verified capture. Min/max configurable. |
| GET | `/api/me/orders?page=1&pageSize=20` | Customer session | Order history. |
| POST | `/api/me/orders` | Customer session | Server prices everything. Same idempotencyKey replays the original order (200). |
| GET | `/api/me/orders/{{orderId}}` | Customer session | Own order only (404 otherwise). |
| POST | `/api/me/orders/{{orderId}}/cancel` | Customer session | Only while placed/accepted/confirmed. Paid amount is refunded to the wallet. |
| POST | `/api/me/orders/{{orderId}}/pay/razorpay` | Customer session | Returns { keyId, razorpayOrderId, amount, currency } for Razorpay Checkout. |
| POST | `/api/me/orders/{{orderId}}/pay/wallet` | Customer session | Full payment from wallet balance. |
| POST | `/api/me/payments/razorpay/confirm` | Customer session | Verifies signature, re-fetches payment from Razorpay, checks amount/currency. |
| POST | `/api/me/reviews` | Customer session | Delivered+paid order items only; starts as pending moderation. |
| GET | `/api/me/tickets` | Customer session | Own tickets. |
| POST | `/api/me/tickets` | Customer session | New support ticket. |
| GET | `/api/me/tickets/{{ticketId}}?threadPage=1` | Customer session | Own ticket (paginated thread). |
| POST | `/api/me/tickets/{{ticketId}}/reply` | Customer session | Append a message (max 200 per ticket). |
| GET | `/api/me/cart` | Customer session | Live-priced cart with availability issues per line. |
| POST | `/api/me/cart/items` | Customer session | Product (quantity) or pet (always 1). Max 50 lines. |
| PATCH | `/api/me/cart/items/{{productId}}` | Customer session | Set a product line's quantity. |
| DELETE | `/api/me/cart/items/{{productId}}` | Customer session | Remove by pet id or product id. |
| DELETE | `/api/me/cart` | Customer session | Empty the cart. |
| POST | `/api/me/cart/coupon-preview` | Customer session | What a coupon would take off (re-validated at checkout). |
| POST | `/api/me/cart/checkout` | Customer session | Creates the order from the cart: server-side prices, shipping, GST, coupon. Replay with same idempotencyKey => 200. |
| GET | `/api/me/orders/{{orderId}}/invoice` | Customer session | Tax invoice, issued when the order ships (404 before). |
| GET | `/api/me/returns` | Customer session | Own return requests. |
| POST | `/api/me/returns` | Customer session | Delivered items within the return window. Live animals excluded by default. |
| GET | `/api/me/privacy/export` | Customer session | Everything held about the customer, as JSON. |
| POST | `/api/me/privacy/delete` | Customer session | Anonymises the account. 409 while orders/refunds/returns/wallet balance are outstanding. |
| POST | `/api/me/uploads/sign` | Customer session | Signed Cloudinary upload (folder fixed to reviews). 503 until configured. |

### Admin / System

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/db-status` | Admin key | Real ping + collection check. |
| POST | `/api/admin/media/sign` | Admin key | Short-lived Cloudinary signature (503 until CLOUDINARY_* set). |

### Admin / Categories

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/categories` | Admin key | Full tree incl. hidden/inactive/archived. ?flat=true&includeArchived=true&parentId=root|<id>. |
| POST | `/api/admin/categories` | Admin key | Root needs `type`; child inherits parent's type. Depth/slug rules enforced. |
| GET | `/api/admin/categories/{{categoryId}}` | Admin key | One category (admin fields). |
| PATCH | `/api/admin/categories/{{categoryId}}` | Admin key | Rename / description / image / icon / SEO / slug (old slug kept as redirect). |
| POST | `/api/admin/categories/{{categoryId}}/move` | Admin key | Reparent (null = root). Rejects cycles, depth overflow, type mismatch; rewrites descendant paths. |
| POST | `/api/admin/categories/reorder` | Admin key | Order of children under one parent. |
| PATCH | `/api/admin/categories/{{categoryId}}/visibility` | Admin key | isVisible (public navigation). |
| PATCH | `/api/admin/categories/{{categoryId}}/active` | Admin key | isActive (operational). |
| POST | `/api/admin/categories/{{categoryId}}/archive` | Admin key | 409 if active children (use archiveDescendants) or dependents (use reassignDependentsTo). |
| POST | `/api/admin/categories/{{categoryId}}/restore` | Admin key | Parent must not be archived. |
| DELETE | `/api/admin/categories/{{categoryId}}` | Admin key | Only if no children, no pets/products, never in an order; else 409. |
| POST | `/api/admin/categories/rebuild-hierarchy` | Admin key | Recompute path/level from parentId. |

### Admin / Pets

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/pets?status=draft&page=1&pageSize=20` | Admin key | Full records incl. private fields. |
| POST | `/api/admin/pets` | Admin key | Dog/cat only; category must be compatible. Created as draft. |
| GET | `/api/admin/pets/{{petId}}` | Admin key | Full record. |
| PATCH | `/api/admin/pets/{{petId}}` | Admin key | Partial update; sold pets cannot change price/type/category. |
| PATCH | `/api/admin/pets/{{petId}}/publication` | Admin key | status: published | draft | archived. Publishing validates description, price, primary image. |
| PATCH | `/api/admin/pets/{{petId}}/availability` | Admin key | available | unavailable. Sold / actively-reserved pets are locked (409). |

### Admin / Products

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/products?lowStock=true&page=1` | Admin key | Includes derived availableQuantity / stockStatus. |
| POST | `/api/admin/products` | Admin key | Accessories only; SKU + slug unique. |
| GET | `/api/admin/products/{{productId}}` | Admin key | Full record. |
| PATCH | `/api/admin/products/{{productId}}` | Admin key | reservedQuantity is never editable. |
| PATCH | `/api/admin/products/{{productId}}/publication` | Admin key | status: published | draft | archived. |
| POST | `/api/admin/products/{{productId}}/stock` | Admin key | Atomic; never below 0 or below reserved. mode set|adjust. |

### Admin / Orders

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/orders?status=placed&paymentStatus=pending&page=1` | Admin key | Filters: status, paymentStatus, customerId, q (exact order number), from, to. |
| GET | `/api/admin/orders/{{orderId}}` | Admin key | Full order (admin note, status history) + payments. |
| POST | `/api/admin/orders/{{orderId}}/status` | Admin key | State machine enforced. confirmed needs paid; refunded needs fully refunded. 'cancelled' is not accepted here. |
| POST | `/api/admin/orders/{{orderId}}/cancel` | Admin key | Idempotent; releases/restocks inventory; refunds paid amount to wallet. |
| PATCH | `/api/admin/orders/{{orderId}}/shipping` | Admin key | Courier + tracking. |
| PATCH | `/api/admin/orders/{{orderId}}/note` | Admin key | Private note (never shown to customers). |
| POST | `/api/admin/orders/{{orderId}}/refund` | Admin key | Omit amount = full remaining. destination wallet (default) | original (Razorpay). |

### Admin / Customers & Wallet

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/customers?q=asha@example.com` | Admin key | Exact-email search; no Google ids returned. |
| GET | `/api/admin/customers/{{customerId}}` | Admin key | Customer record (no Google id). |
| PATCH | `/api/admin/customers/{{customerId}}/status` | Admin key | Takes effect on the customer's next request. |
| GET | `/api/admin/customers/{{customerId}}/wallet` | Admin key | Balance + ledger incl. idempotency keys / actors. |
| POST | `/api/admin/customers/{{customerId}}/wallet/adjust` | Admin key | Ledgered + idempotent. Debit cannot overdraw. |
| POST | `/api/admin/customers/{{customerId}}/wallet/reconcile` | Admin key | Compare balance vs ledger; {fix:true} rewrites balance from ledger. |

### Admin / Reviews & Support

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/reviews?status=pending` | Admin key | Moderation queue. |
| PATCH | `/api/admin/reviews/{{reviewId}}/moderation` | Admin key | approved | rejected | hidden | pending. Rating summary updated atomically. |
| GET | `/api/admin/tickets?status=open` | Admin key | Admin inbox. |
| GET | `/api/admin/tickets/{{ticketId}}?threadPage=1` | Admin key | Paginated thread. |
| POST | `/api/admin/tickets/{{ticketId}}/reply` | Admin key | Admin reply (ticket moves to pending). |
| PATCH | `/api/admin/tickets/{{ticketId}}/status` | Admin key | open | pending | resolved | closed. |
| POST | `/api/admin/tickets/{{ticketId}}/assign` | Admin key | Assigns to the calling admin identity. |

### Admin / Account

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/admin/auth/login` | none | E-mail + password (+ TOTP / recovery code). 10/15 min per IP; 5 failures lock the account 15 min. Sets HttpOnly session cookie. |
| GET | `/api/admin/auth/me` | Admin key | Role + permissions for the UI. |
| POST | `/api/admin/auth/logout` | Admin key | Revokes the session and clears the cookie. |
| POST | `/api/admin/auth/password` | Admin key | Signs out all other sessions. |
| POST | `/api/admin/auth/mfa/setup` | Admin key | Returns TOTP secret + otpauth URL (render as QR). Session accounts only. |
| POST | `/api/admin/auth/mfa/enable` | Admin key | Confirm with an authenticator code; returns 8 recovery codes once. |
| POST | `/api/admin/auth/mfa/disable` | Admin key | Needs password + code. |
| GET | `/api/admin/admins` | Admin key | Owner only. |
| POST | `/api/admin/admins` | Admin key | Roles: owner, catalog, orders, finance, support. Password policy enforced. |
| PATCH | `/api/admin/admins/{{adminId}}` | Admin key | Signs that admin out everywhere; last owner is protected. |
| POST | `/api/admin/admins/{{adminId}}/reset-password` | Admin key | Owner sets a new password; sessions revoked. |
| GET | `/api/admin/audit-logs?page=1&method=POST` | Admin key | Every admin write / denied attempt (no request bodies). |

### Admin / Operations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/dashboard` | Admin key | Queues + 7/30-day sales + 14-day series. |
| GET | `/api/admin/settings` | Admin key | Shipping rules, GST mode + seller details, return policy. |
| PATCH | `/api/admin/settings` | Admin key | Owner only. stateFees keyed by GST state code (33 = Tamil Nadu). |
| GET | `/api/admin/coupons?page=1` | Admin key | Coupons with usage counts. |
| POST | `/api/admin/coupons` | Admin key | percent (1-100) or fixed paise; limits, window, appliesTo. |
| PATCH | `/api/admin/coupons/{{couponId}}` | Admin key | Activate/deactivate, extend, change limits. |
| POST | `/api/admin/orders/{{orderId}}/invoice` | Admin key | Idempotent: one GST invoice per order. |
| GET | `/api/admin/returns?status=requested` | Admin key | Return queue. |
| POST | `/api/admin/returns/{{returnId}}/action` | Admin key | approve | reject | receive | close. |
| POST | `/api/admin/returns/{{returnId}}/refund` | Admin key | Finance. Received returns only; default = proportional value to wallet. |

## Request examples

**Contact form** — `POST /api/contact`
```bash
curl -X POST "$BASE/api/contact" -H "Content-Type: application/json" \
  -d '{"name":"Guest","email":"guest@example.com","subject":"Delivery question","body":"Where can I track my delivery?","category":"delivery"}'
```

**Google sign-in** — `POST /api/auth/google`
```bash
curl -X POST "$BASE/api/auth/google" -H "Content-Type: application/json" \
  -d '{"idToken":"<google-id-token>"}'
```

**Update profile** — `PATCH /api/me`
```bash
curl -X PATCH "$BASE/api/me" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"firstName":"Asha","phone":"+91 9876543210"}'
```

**Add address** — `POST /api/me/addresses`
```bash
curl -X POST "$BASE/api/me/addresses" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"label":"Home","recipientName":"Asha K","phone":"+91 9876543210","line1":"12 Park Street","city":"Chennai","state":"Tamil Nadu","postalCode":"600001","countryCode":"IN"}'
```

**Edit address** — `PATCH /api/me/addresses/{{addressId}}`
```bash
curl -X PATCH "$BASE/api/me/addresses/{{addressId}}" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"landmark":"Near the temple"}'
```

**Set default address** — `POST /api/me/addresses/{{addressId}}/default`
```bash
curl -X POST "$BASE/api/me/addresses/{{addressId}}/default" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"shipping":true,"billing":true}'
```

**Wallet top-up (Razorpay order)** — `POST /api/me/wallet/topup`
```bash
curl -X POST "$BASE/api/me/wallet/topup" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"amount":50000}'
```

**Create order (checkout)** — `POST /api/me/orders`
```bash
curl -X POST "$BASE/api/me/orders" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"itemType":"product","productId":"{{productId}}","quantity":2},{"itemType":"pet","petId":"{{petId}}"}],"shippingAddressId":"{{addressId}}","idempotencyKey":"checkout-0001-abcdef"}'
```

**Cancel my order** — `POST /api/me/orders/{{orderId}}/cancel`
```bash
curl -X POST "$BASE/api/me/orders/{{orderId}}/cancel" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"reason":"Changed my mind"}'
```

**Razorpay confirm** — `POST /api/me/payments/razorpay/confirm`
```bash
curl -X POST "$BASE/api/me/payments/razorpay/confirm" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"razorpay_order_id":"order_XXXXXXXX","razorpay_payment_id":"pay_XXXXXXXX","razorpay_signature":"<signature>"}'
```

**Create review** — `POST /api/me/reviews`
```bash
curl -X POST "$BASE/api/me/reviews" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"orderId":"{{orderId}}","orderItemId":"{{orderItemId}}","rating":5,"title":"Great","comment":"Loved it"}'
```

**Open ticket** — `POST /api/me/tickets`
```bash
curl -X POST "$BASE/api/me/tickets" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"subject":"Refund question","body":"When will my refund arrive?","category":"refund","orderId":"{{orderId}}"}'
```

**Reply to ticket** — `POST /api/me/tickets/{{ticketId}}/reply`
```bash
curl -X POST "$BASE/api/me/tickets/{{ticketId}}/reply" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"body":"Thanks for the update."}'
```

**Media upload signature** — `POST /api/admin/media/sign`
```bash
curl -X POST "$BASE/api/admin/media/sign" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"folder":"pets"}'
```

**Create category** — `POST /api/admin/categories`
```bash
curl -X POST "$BASE/api/admin/categories" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Reptiles","type":"accessory","description":"Anything reptile related"}'
```

**Edit category** — `PATCH /api/admin/categories/{{categoryId}}`
```bash
curl -X PATCH "$BASE/api/admin/categories/{{categoryId}}" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Reptile Supplies","seoTitle":"Reptile supplies"}'
```

**Move category** — `POST /api/admin/categories/{{categoryId}}/move`
```bash
curl -X POST "$BASE/api/admin/categories/{{categoryId}}/move" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"parentId":"{{categoryId2}}"}'
```

**Reorder siblings** — `POST /api/admin/categories/reorder`
```bash
curl -X POST "$BASE/api/admin/categories/reorder" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"parentId":"{{categoryId2}}","orderedIds":["{{categoryId}}"]}'
```

**Show / hide** — `PATCH /api/admin/categories/{{categoryId}}/visibility`
```bash
curl -X PATCH "$BASE/api/admin/categories/{{categoryId}}/visibility" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"isVisible":false}'
```

**Activate / deactivate** — `PATCH /api/admin/categories/{{categoryId}}/active`
```bash
curl -X PATCH "$BASE/api/admin/categories/{{categoryId}}/active" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"isActive":true}'
```

**Archive category** — `POST /api/admin/categories/{{categoryId}}/archive`
```bash
curl -X POST "$BASE/api/admin/categories/{{categoryId}}/archive" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"archiveDescendants":false,"reassignDependentsTo":"{{categoryId2}}"}'
```

**Restore category** — `POST /api/admin/categories/{{categoryId}}/restore`
```bash
curl -X POST "$BASE/api/admin/categories/{{categoryId}}/restore" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"restoreDescendants":false}'
```

**Create pet** — `POST /api/admin/pets`
```bash
curl -X POST "$BASE/api/admin/pets" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Bruno","type":"dog","categoryId":"{{labCategoryId}}","breed":"Labrador","price":4500000,"description":"Friendly, vaccinated labrador puppy.","media":[{"kind":"image","url":"https://cdn.example.com/bruno.jpg","isPrimary":true}]}'
```

**Edit pet** — `PATCH /api/admin/pets/{{petId}}`
```bash
curl -X PATCH "$BASE/api/admin/pets/{{petId}}" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"price":4200000,"discountType":"percent","discountValue":5}'
```

**Publish / unpublish / archive pet** — `PATCH /api/admin/pets/{{petId}}/publication`
```bash
curl -X PATCH "$BASE/api/admin/pets/{{petId}}/publication" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"status":"published"}'
```

**Pet availability** — `PATCH /api/admin/pets/{{petId}}/availability`
```bash
curl -X PATCH "$BASE/api/admin/pets/{{petId}}/availability" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"status":"unavailable"}'
```

**Create product** — `POST /api/admin/products`
```bash
curl -X POST "$BASE/api/admin/products" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Rope Toy","sku":"TOY-ROPE-1","categoryId":"{{accessoriesCategoryId}}","compatibility":["dog"],"price":49900,"stockQuantity":25,"description":"Durable cotton rope toy.","media":[{"kind":"image","url":"https://cdn.example.com/rope.jpg","isPrimary":true}]}'
```

**Edit product** — `PATCH /api/admin/products/{{productId}}`
```bash
curl -X PATCH "$BASE/api/admin/products/{{productId}}" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"price":52900,"isFeatured":true}'
```

**Publish / unpublish / archive product** — `PATCH /api/admin/products/{{productId}}/publication`
```bash
curl -X PATCH "$BASE/api/admin/products/{{productId}}/publication" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"status":"published"}'
```

**Adjust stock** — `POST /api/admin/products/{{productId}}/stock`
```bash
curl -X POST "$BASE/api/admin/products/{{productId}}/stock" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"mode":"adjust","value":10}'
```

**Change status** — `POST /api/admin/orders/{{orderId}}/status`
```bash
curl -X POST "$BASE/api/admin/orders/{{orderId}}/status" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"status":"accepted","note":"Verified"}'
```

**Cancel order** — `POST /api/admin/orders/{{orderId}}/cancel`
```bash
curl -X POST "$BASE/api/admin/orders/{{orderId}}/cancel" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"reason":"Out of stock"}'
```

**Update shipping** — `PATCH /api/admin/orders/{{orderId}}/shipping`
```bash
curl -X PATCH "$BASE/api/admin/orders/{{orderId}}/shipping" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"partner":"Delhivery","trackingNumber":"DLV123456","trackingUrl":"https://track.example.com/DLV123456"}'
```

**Set admin note** — `PATCH /api/admin/orders/{{orderId}}/note`
```bash
curl -X PATCH "$BASE/api/admin/orders/{{orderId}}/note" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"adminNote":"Call before delivery"}'
```

**Refund order** — `POST /api/admin/orders/{{orderId}}/refund`
```bash
curl -X POST "$BASE/api/admin/orders/{{orderId}}/refund" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"amount":10000,"reason":"Damaged item","destination":"wallet"}'
```

**Suspend / activate customer** — `PATCH /api/admin/customers/{{customerId}}/status`
```bash
curl -X PATCH "$BASE/api/admin/customers/{{customerId}}/status" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"status":"suspended"}'
```

**Adjust wallet** — `POST /api/admin/customers/{{customerId}}/wallet/adjust`
```bash
curl -X POST "$BASE/api/admin/customers/{{customerId}}/wallet/adjust" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"direction":"credit","amount":20000,"reason":"Goodwill credit","idempotencyKey":"adj-2026-0001"}'
```

**Reconcile wallet** — `POST /api/admin/customers/{{customerId}}/wallet/reconcile`
```bash
curl -X POST "$BASE/api/admin/customers/{{customerId}}/wallet/reconcile" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"fix":false}'
```

**Moderate review** — `PATCH /api/admin/reviews/{{reviewId}}/moderation`
```bash
curl -X PATCH "$BASE/api/admin/reviews/{{reviewId}}/moderation" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"status":"approved"}'
```

**Reply to ticket** — `POST /api/admin/tickets/{{ticketId}}/reply`
```bash
curl -X POST "$BASE/api/admin/tickets/{{ticketId}}/reply" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"body":"We have initiated your refund."}'
```

**Set ticket status** — `PATCH /api/admin/tickets/{{ticketId}}/status`
```bash
curl -X PATCH "$BASE/api/admin/tickets/{{ticketId}}/status" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"status":"resolved"}'
```

**Add to cart** — `POST /api/me/cart/items`
```bash
curl -X POST "$BASE/api/me/cart/items" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"itemType":"product","productId":"{{productId}}","quantity":2}'
```

**Cart: change quantity** — `PATCH /api/me/cart/items/{{productId}}`
```bash
curl -X PATCH "$BASE/api/me/cart/items/{{productId}}" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"quantity":3}'
```

**Cart: coupon preview** — `POST /api/me/cart/coupon-preview`
```bash
curl -X POST "$BASE/api/me/cart/coupon-preview" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"code":"WELCOME10"}'
```

**Checkout from cart** — `POST /api/me/cart/checkout`
```bash
curl -X POST "$BASE/api/me/cart/checkout" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"shippingAddressId":"{{addressId}}","couponCode":"WELCOME10","idempotencyKey":"cart-checkout-0001"}'
```

**Request a return** — `POST /api/me/returns`
```bash
curl -X POST "$BASE/api/me/returns" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"orderId":"{{orderId}}","orderItemId":"{{orderItemId}}","quantity":1,"reason":"damaged","details":"Arrived broken"}'
```

**Delete my account** — `POST /api/me/privacy/delete`
```bash
curl -X POST "$BASE/api/me/privacy/delete" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H "Content-Type: application/json" \
  -d '{"confirm":"DELETE MY ACCOUNT"}'
```

**Admin login** — `POST /api/admin/auth/login`
```bash
curl -X POST "$BASE/api/admin/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"owner@petblitz.in","password":"<password>","totp":"123456"}'
```

**Change my password** — `POST /api/admin/auth/password`
```bash
curl -X POST "$BASE/api/admin/auth/password" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"current":"old-password","next":"A-new-strong-passphrase-1"}'
```

**MFA: enable** — `POST /api/admin/auth/mfa/enable`
```bash
curl -X POST "$BASE/api/admin/auth/mfa/enable" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"code":"123456"}'
```

**MFA: disable** — `POST /api/admin/auth/mfa/disable`
```bash
curl -X POST "$BASE/api/admin/auth/mfa/disable" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"password":"<password>","code":"123456"}'
```

**Create admin** — `POST /api/admin/admins`
```bash
curl -X POST "$BASE/api/admin/admins" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"ops@petblitz.in","name":"Ops Lead","role":"orders","password":"A-strong-passphrase-42"}'
```

**Update admin (role / active)** — `PATCH /api/admin/admins/{{adminId}}`
```bash
curl -X PATCH "$BASE/api/admin/admins/{{adminId}}" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"role":"support","isActive":true}'
```

**Reset admin password** — `POST /api/admin/admins/{{adminId}}/reset-password`
```bash
curl -X POST "$BASE/api/admin/admins/{{adminId}}/reset-password" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"password":"Another-strong-passphrase-7"}'
```

**Update settings** — `PATCH /api/admin/settings`
```bash
curl -X PATCH "$BASE/api/admin/settings" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"shipping":{"baseFeeMinor":6000,"freeAboveMinor":99900,"stateFees":{"33":4000}},"tax":{"pricesIncludeTax":true,"sellerStateCode":"33","sellerGstin":"33ABCDE1234F1Z5","legalName":"PetBlitz","invoicePrefix":"PB"},"returns":{"windowDays":7,"petsReturnable":false}}'
```

**Create coupon** — `POST /api/admin/coupons`
```bash
curl -X POST "$BASE/api/admin/coupons" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"code":"WELCOME10","description":"10% off","type":"percent","value":10,"minOrderMinor":50000,"maxDiscountMinor":20000,"perCustomerLimit":1}'
```

**Update coupon** — `PATCH /api/admin/coupons/{{couponId}}`
```bash
curl -X PATCH "$BASE/api/admin/coupons/{{couponId}}" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"isActive":false}'
```

**Act on return** — `POST /api/admin/returns/{{returnId}}/action`
```bash
curl -X POST "$BASE/api/admin/returns/{{returnId}}/action" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"action":"approve","note":"Please ship it back"}'
```

**Refund return** — `POST /api/admin/returns/{{returnId}}/refund`
```bash
curl -X POST "$BASE/api/admin/returns/{{returnId}}/refund" -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"destination":"wallet"}'
```
