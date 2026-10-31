/**
 * SINGLE SOURCE OF TRUTH for every HTTP endpoint.
 * Used by: scripts/generate-api-docs.ts (Thunder Client collection + docs/API.md) and tests/unit/routes.test.ts
 * (auth/validation/status checks for every route + a completeness check against src/app/api).
 * Path variables like {{orderId}} are Thunder Client variables.
 */
export type Auth = "public" | "admin" | "customer" | "cron" | "webhook";
export interface Endpoint {
  group: string; name: string; method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; auth: Auth;
  desc: string; query?: string; body?: unknown;
  invalidBody?: unknown;      // must produce 400
  invalidQuery?: string;      // must produce 400
  expect?: number;            // success status (default 200)
  skipValid?: boolean;        // route needs a real DB / network; excluded from the mocked table test
  headers?: Record<string, string>;
}

const catBody = { name: "Reptiles", type: "accessory", description: "Anything reptile related" };
const petBody = { name: "Bruno", type: "dog", categoryId: "{{labCategoryId}}", breed: "Labrador", price: 4500000, description: "Friendly, vaccinated labrador puppy.", media: [{ kind: "image", url: "https://cdn.example.com/bruno.jpg", isPrimary: true }] };
const productBody = { name: "Rope Toy", sku: "TOY-ROPE-1", categoryId: "{{accessoriesCategoryId}}", compatibility: ["dog"], price: 49900, stockQuantity: 25, description: "Durable cotton rope toy.", media: [{ kind: "image", url: "https://cdn.example.com/rope.jpg", isPrimary: true }] };
const addr = { label: "Home", recipientName: "Asha K", phone: "+91 9876543210", line1: "12 Park Street", city: "Chennai", state: "Tamil Nadu", postalCode: "600001", countryCode: "IN" };

export const ENDPOINTS: Endpoint[] = [
  // ------------------------------------------------------------------ public (existing contracts, unchanged)
  { group: "Public", name: "Health", method: "GET", path: "/api/health", auth: "public", desc: "Liveness (no database)." },
  { group: "Public", name: "Category tree", method: "GET", path: "/api/categories", auth: "public", desc: "Public hierarchy: only active, visible, unarchived categories whose whole ancestor chain is eligible." },
  { group: "Public", name: "Category by slug", method: "GET", path: "/api/categories", query: "slug=labrador", auth: "public", desc: "Category + children + breadcrumbs (old slugs redirect).", invalidQuery: "bogus=1" },
  { group: "Public", name: "List pets", method: "GET", path: "/api/pets", query: "type=dog&sort=price_asc&page=1&pageSize=10", auth: "public", desc: "Published pets (private fields never returned).", invalidQuery: "pageSize=999" },
  { group: "Public", name: "Pet by slug", method: "GET", path: "/api/pets/{{petSlug}}", auth: "public", desc: "Single published pet." },
  { group: "Public", name: "List products", method: "GET", path: "/api/products", query: "compatibility=dog&inStock=true", auth: "public", desc: "Published accessories.", invalidQuery: "pageSize=999" },
  { group: "Public", name: "Product by slug", method: "GET", path: "/api/products/{{productSlug}}", auth: "public", desc: "Single published product." },
  { group: "Public", name: "Public reviews", method: "GET", path: "/api/reviews", query: "targetType=product&targetId={{productId}}", auth: "public", desc: "Approved reviews only.", invalidQuery: "targetType=bogus" },
  { group: "Public", name: "Contact form", method: "POST", path: "/api/contact", auth: "public", desc: "Creates a support ticket. 5 requests / 10 min / IP. Honeypot field `website` must stay empty.", body: { name: "Guest", email: "guest@example.com", subject: "Delivery question", body: "Where can I track my delivery?", category: "delivery" }, invalidBody: { name: "", email: "nope" }, expect: 201 },
  { group: "Public", name: "Razorpay webhook", method: "POST", path: "/api/webhooks/razorpay", auth: "webhook", desc: "Razorpay -> server. Needs x-razorpay-signature (HMAC of RAW body) and x-razorpay-event-id headers.", body: { event: "ping", payload: {} }, headers: { "x-razorpay-signature": "<hmac-sha256-hex>", "x-razorpay-event-id": "evt_test_1" } },
  { group: "Public", name: "Scheduler: release expired", method: "POST", path: "/api/cron/release-expired", auth: "cron", desc: "Cancels unpaid orders past the TTL, frees reservations, finalises stuck wallet refunds. Bearer CRON_SECRET." },

  // ------------------------------------------------------------------ customer auth
  { group: "Customer auth", name: "Google sign-in", method: "POST", path: "/api/auth/google", auth: "public", desc: "Exchange a Google ID token for an HttpOnly session cookie. Needs GOOGLE_CLIENT_ID + SESSION_SECRET.", body: { idToken: "<google-id-token>" }, invalidBody: { idToken: "x" }, skipValid: true },
  { group: "Customer auth", name: "Sign out", method: "POST", path: "/api/auth/logout", auth: "public", desc: "Clears the session cookie.", skipValid: true },

  // ------------------------------------------------------------------ customer
  { group: "Customer", name: "My profile", method: "GET", path: "/api/me", auth: "customer", desc: "Profile incl. wallet balance." },
  { group: "Customer", name: "Update profile", method: "PATCH", path: "/api/me", auth: "customer", desc: "Allow-listed fields only (status/role/email are rejected).", body: { firstName: "Asha", phone: "+91 9876543210" }, invalidBody: { status: "active" } },
  { group: "Customer", name: "List addresses", method: "GET", path: "/api/me/addresses", auth: "customer", desc: "Saved addresses." },
  { group: "Customer", name: "Add address", method: "POST", path: "/api/me/addresses", auth: "customer", desc: "Max 10 addresses.", body: addr, invalidBody: { line1: "" }, expect: 201 },
  { group: "Customer", name: "Edit address", method: "PATCH", path: "/api/me/addresses/{{addressId}}", auth: "customer", desc: "Partial update.", body: { landmark: "Near the temple" }, invalidBody: { countryCode: "INDIA" } },
  { group: "Customer", name: "Delete address", method: "DELETE", path: "/api/me/addresses/{{addressId}}", auth: "customer", desc: "Removes the address and any default pointing at it." },
  { group: "Customer", name: "Set default address", method: "POST", path: "/api/me/addresses/{{addressId}}/default", auth: "customer", desc: "Default shipping and/or billing.", body: { shipping: true, billing: true }, invalidBody: { shipping: "yes" } },
  { group: "Customer", name: "Wallet balance + statement", method: "GET", path: "/api/me/wallet", query: "page=1&pageSize=20", auth: "customer", desc: "Balance (paise) and ledger statement.", invalidQuery: "pageSize=999" },
  { group: "Customer", name: "Wallet top-up (Razorpay order)", method: "POST", path: "/api/me/wallet/topup", auth: "customer", desc: "Creates a Razorpay order. Wallet is credited only after verified capture. Min/max configurable.", body: { amount: 50000 }, invalidBody: { amount: -5 }, expect: 201 },
  { group: "Customer", name: "My orders", method: "GET", path: "/api/me/orders", query: "page=1&pageSize=20", auth: "customer", desc: "Order history.", invalidQuery: "pageSize=999" },
  { group: "Customer", name: "Create order (checkout)", method: "POST", path: "/api/me/orders", auth: "customer", desc: "Server prices everything. Same idempotencyKey replays the original order (200).", body: { items: [{ itemType: "product", productId: "{{productId}}", quantity: 2 }, { itemType: "pet", petId: "{{petId}}" }], shippingAddressId: "{{addressId}}", idempotencyKey: "checkout-0001-abcdef" }, invalidBody: { items: [], shippingAddressId: "x", grandTotal: 1 }, expect: 201 },
  { group: "Customer", name: "Order detail", method: "GET", path: "/api/me/orders/{{orderId}}", auth: "customer", desc: "Own order only (404 otherwise)." },
  { group: "Customer", name: "Cancel my order", method: "POST", path: "/api/me/orders/{{orderId}}/cancel", auth: "customer", desc: "Only while placed/accepted/confirmed. Paid amount is refunded to the wallet.", body: { reason: "Changed my mind" }, invalidBody: { reason: 5 } },
  { group: "Customer", name: "Pay: create Razorpay order", method: "POST", path: "/api/me/orders/{{orderId}}/pay/razorpay", auth: "customer", desc: "Returns { keyId, razorpayOrderId, amount, currency } for Razorpay Checkout.", expect: 201 },
  { group: "Customer", name: "Pay: with wallet", method: "POST", path: "/api/me/orders/{{orderId}}/pay/wallet", auth: "customer", desc: "Full payment from wallet balance." },
  { group: "Customer", name: "Razorpay confirm", method: "POST", path: "/api/me/payments/razorpay/confirm", auth: "customer", desc: "Verifies signature, re-fetches payment from Razorpay, checks amount/currency.", body: { razorpay_order_id: "order_XXXXXXXX", razorpay_payment_id: "pay_XXXXXXXX", razorpay_signature: "<signature>" }, invalidBody: { razorpay_order_id: "x" } },
  { group: "Customer", name: "Create review", method: "POST", path: "/api/me/reviews", auth: "customer", desc: "Delivered+paid order items only; starts as pending moderation.", body: { orderId: "{{orderId}}", orderItemId: "{{orderItemId}}", rating: 5, title: "Great", comment: "Loved it" }, invalidBody: { orderId: "{{orderId}}", orderItemId: "{{orderItemId}}", rating: 9 }, expect: 201 },
  { group: "Customer", name: "My tickets", method: "GET", path: "/api/me/tickets", auth: "customer", desc: "Own tickets." },
  { group: "Customer", name: "Open ticket", method: "POST", path: "/api/me/tickets", auth: "customer", desc: "New support ticket.", body: { subject: "Refund question", body: "When will my refund arrive?", category: "refund", orderId: "{{orderId}}" }, invalidBody: { subject: "x" }, expect: 201 },
  { group: "Customer", name: "Ticket detail", method: "GET", path: "/api/me/tickets/{{ticketId}}", query: "threadPage=1", auth: "customer", desc: "Own ticket (paginated thread).", invalidQuery: "threadPage=0" },
  { group: "Customer", name: "Reply to ticket", method: "POST", path: "/api/me/tickets/{{ticketId}}/reply", auth: "customer", desc: "Append a message (max 200 per ticket).", body: { body: "Thanks for the update." }, invalidBody: { body: "" }, expect: 201 },

  // ------------------------------------------------------------------ admin: diagnostics + media
  { group: "Admin / System", name: "DB status", method: "GET", path: "/api/admin/db-status", auth: "admin", desc: "Real ping + collection check.", skipValid: true },
  { group: "Admin / System", name: "Media upload signature", method: "POST", path: "/api/admin/media/sign", auth: "admin", desc: "Short-lived Cloudinary signature (503 until CLOUDINARY_* set).", body: { folder: "pets" }, invalidBody: { folder: "../etc" } },

  // ------------------------------------------------------------------ admin: categories
  { group: "Admin / Categories", name: "Category tree (admin)", method: "GET", path: "/api/admin/categories", auth: "admin", desc: "Full tree incl. hidden/inactive/archived. ?flat=true&includeArchived=true&parentId=root|<id>.", invalidQuery: "flat=maybe" },
  { group: "Admin / Categories", name: "Create category", method: "POST", path: "/api/admin/categories", auth: "admin", desc: "Root needs `type`; child inherits parent's type. Depth/slug rules enforced.", body: catBody, invalidBody: { name: "No type" }, expect: 201 },
  { group: "Admin / Categories", name: "Get category", method: "GET", path: "/api/admin/categories/{{categoryId}}", auth: "admin", desc: "One category (admin fields)." },
  { group: "Admin / Categories", name: "Edit category", method: "PATCH", path: "/api/admin/categories/{{categoryId}}", auth: "admin", desc: "Rename / description / image / icon / SEO / slug (old slug kept as redirect).", body: { name: "Reptile Supplies", seoTitle: "Reptile supplies" }, invalidBody: { parentId: "x" } },
  { group: "Admin / Categories", name: "Move category", method: "POST", path: "/api/admin/categories/{{categoryId}}/move", auth: "admin", desc: "Reparent (null = root). Rejects cycles, depth overflow, type mismatch; rewrites descendant paths.", body: { parentId: "{{categoryId2}}" }, invalidBody: { parentId: "nope" } },
  { group: "Admin / Categories", name: "Reorder siblings", method: "POST", path: "/api/admin/categories/reorder", auth: "admin", desc: "Order of children under one parent.", body: { parentId: "{{categoryId2}}", orderedIds: ["{{categoryId}}"] }, invalidBody: { parentId: null, orderedIds: [] } },
  { group: "Admin / Categories", name: "Show / hide", method: "PATCH", path: "/api/admin/categories/{{categoryId}}/visibility", auth: "admin", desc: "isVisible (public navigation).", body: { isVisible: false }, invalidBody: { isVisible: "no" } },
  { group: "Admin / Categories", name: "Activate / deactivate", method: "PATCH", path: "/api/admin/categories/{{categoryId}}/active", auth: "admin", desc: "isActive (operational).", body: { isActive: true }, invalidBody: { isActive: 1 } },
  { group: "Admin / Categories", name: "Archive category", method: "POST", path: "/api/admin/categories/{{categoryId}}/archive", auth: "admin", desc: "409 if active children (use archiveDescendants) or dependents (use reassignDependentsTo).", body: { archiveDescendants: false, reassignDependentsTo: "{{categoryId2}}" }, invalidBody: { reassignDependentsTo: "x" } },
  { group: "Admin / Categories", name: "Restore category", method: "POST", path: "/api/admin/categories/{{categoryId}}/restore", auth: "admin", desc: "Parent must not be archived.", body: { restoreDescendants: false }, invalidBody: { restoreDescendants: "yes" } },
  { group: "Admin / Categories", name: "Delete category (safe)", method: "DELETE", path: "/api/admin/categories/{{categoryId}}", auth: "admin", desc: "Only if no children, no pets/products, never in an order; else 409." },
  { group: "Admin / Categories", name: "Rebuild hierarchy (recovery)", method: "POST", path: "/api/admin/categories/rebuild-hierarchy", auth: "admin", desc: "Recompute path/level from parentId." },

  // ------------------------------------------------------------------ admin: pets
  { group: "Admin / Pets", name: "List pets (admin)", method: "GET", path: "/api/admin/pets", query: "status=draft&page=1&pageSize=20", auth: "admin", desc: "Full records incl. private fields.", invalidQuery: "status=bogus" },
  { group: "Admin / Pets", name: "Create pet", method: "POST", path: "/api/admin/pets", auth: "admin", desc: "Dog/cat only; category must be compatible. Created as draft.", body: petBody, invalidBody: { name: "x", type: "rabbit" }, expect: 201 },
  { group: "Admin / Pets", name: "Get pet (admin)", method: "GET", path: "/api/admin/pets/{{petId}}", auth: "admin", desc: "Full record." },
  { group: "Admin / Pets", name: "Edit pet", method: "PATCH", path: "/api/admin/pets/{{petId}}", auth: "admin", desc: "Partial update; sold pets cannot change price/type/category.", body: { price: 4200000, discountType: "percent", discountValue: 5 }, invalidBody: { price: -1 } },
  { group: "Admin / Pets", name: "Publish / unpublish / archive pet", method: "PATCH", path: "/api/admin/pets/{{petId}}/publication", auth: "admin", desc: "status: published | draft | archived. Publishing validates description, price, primary image.", body: { status: "published" }, invalidBody: { status: "deleted" } },
  { group: "Admin / Pets", name: "Pet availability", method: "PATCH", path: "/api/admin/pets/{{petId}}/availability", auth: "admin", desc: "available | unavailable. Sold / actively-reserved pets are locked (409).", body: { status: "unavailable" }, invalidBody: { status: "sold" } },

  // ------------------------------------------------------------------ admin: products
  { group: "Admin / Products", name: "List products (admin)", method: "GET", path: "/api/admin/products", query: "lowStock=true&page=1", auth: "admin", desc: "Includes derived availableQuantity / stockStatus.", invalidQuery: "lowStock=maybe" },
  { group: "Admin / Products", name: "Create product", method: "POST", path: "/api/admin/products", auth: "admin", desc: "Accessories only; SKU + slug unique.", body: productBody, invalidBody: { name: "x", stockQuantity: -1 }, expect: 201 },
  { group: "Admin / Products", name: "Get product (admin)", method: "GET", path: "/api/admin/products/{{productId}}", auth: "admin", desc: "Full record." },
  { group: "Admin / Products", name: "Edit product", method: "PATCH", path: "/api/admin/products/{{productId}}", auth: "admin", desc: "reservedQuantity is never editable.", body: { price: 52900, isFeatured: true }, invalidBody: { reservedQuantity: 3 } },
  { group: "Admin / Products", name: "Publish / unpublish / archive product", method: "PATCH", path: "/api/admin/products/{{productId}}/publication", auth: "admin", desc: "status: published | draft | archived.", body: { status: "published" }, invalidBody: { status: "x" } },
  { group: "Admin / Products", name: "Adjust stock", method: "POST", path: "/api/admin/products/{{productId}}/stock", auth: "admin", desc: "Atomic; never below 0 or below reserved. mode set|adjust.", body: { mode: "adjust", value: 10 }, invalidBody: { mode: "set", value: 1.5 } },

  // ------------------------------------------------------------------ admin: orders / refunds
  { group: "Admin / Orders", name: "List orders", method: "GET", path: "/api/admin/orders", query: "status=placed&paymentStatus=pending&page=1", auth: "admin", desc: "Filters: status, paymentStatus, customerId, q (exact order number), from, to.", invalidQuery: "status=bogus" },
  { group: "Admin / Orders", name: "Order detail", method: "GET", path: "/api/admin/orders/{{orderId}}", auth: "admin", desc: "Full order (admin note, status history) + payments." },
  { group: "Admin / Orders", name: "Change status", method: "POST", path: "/api/admin/orders/{{orderId}}/status", auth: "admin", desc: "State machine enforced. confirmed needs paid; refunded needs fully refunded. 'cancelled' is not accepted here.", body: { status: "accepted", note: "Verified" }, invalidBody: { status: "cancelled" } },
  { group: "Admin / Orders", name: "Cancel order", method: "POST", path: "/api/admin/orders/{{orderId}}/cancel", auth: "admin", desc: "Idempotent; releases/restocks inventory; refunds paid amount to wallet.", body: { reason: "Out of stock" }, invalidBody: { reason: 5 } },
  { group: "Admin / Orders", name: "Update shipping", method: "PATCH", path: "/api/admin/orders/{{orderId}}/shipping", auth: "admin", desc: "Courier + tracking.", body: { partner: "Delhivery", trackingNumber: "DLV123456", trackingUrl: "https://track.example.com/DLV123456" }, invalidBody: { trackingUrl: "not-a-url" } },
  { group: "Admin / Orders", name: "Set admin note", method: "PATCH", path: "/api/admin/orders/{{orderId}}/note", auth: "admin", desc: "Private note (never shown to customers).", body: { adminNote: "Call before delivery" }, invalidBody: { adminNote: 5 } },
  { group: "Admin / Orders", name: "Refund order", method: "POST", path: "/api/admin/orders/{{orderId}}/refund", auth: "admin", desc: "Omit amount = full remaining. destination wallet (default) | original (Razorpay).", body: { amount: 10000, reason: "Damaged item", destination: "wallet" }, invalidBody: { amount: 0 } },

  // ------------------------------------------------------------------ admin: customers / wallet
  { group: "Admin / Customers & Wallet", name: "List customers", method: "GET", path: "/api/admin/customers", query: "q=asha@example.com", auth: "admin", desc: "Exact-email search; no Google ids returned.", invalidQuery: "q=not-an-email" },
  { group: "Admin / Customers & Wallet", name: "Get customer", method: "GET", path: "/api/admin/customers/{{customerId}}", auth: "admin", desc: "Customer record (no Google id)." },
  { group: "Admin / Customers & Wallet", name: "Suspend / activate customer", method: "PATCH", path: "/api/admin/customers/{{customerId}}/status", auth: "admin", desc: "Takes effect on the customer's next request.", body: { status: "suspended" }, invalidBody: { status: "deleted" } },
  { group: "Admin / Customers & Wallet", name: "Customer wallet", method: "GET", path: "/api/admin/customers/{{customerId}}/wallet", auth: "admin", desc: "Balance + ledger incl. idempotency keys / actors.", invalidQuery: "pageSize=999" },
  { group: "Admin / Customers & Wallet", name: "Adjust wallet", method: "POST", path: "/api/admin/customers/{{customerId}}/wallet/adjust", auth: "admin", desc: "Ledgered + idempotent. Debit cannot overdraw.", body: { direction: "credit", amount: 20000, reason: "Goodwill credit", idempotencyKey: "adj-2026-0001" }, invalidBody: { direction: "credit", amount: -1, reason: "x", idempotencyKey: "short" } },
  { group: "Admin / Customers & Wallet", name: "Reconcile wallet", method: "POST", path: "/api/admin/customers/{{customerId}}/wallet/reconcile", auth: "admin", desc: "Compare balance vs ledger; {fix:true} rewrites balance from ledger.", body: { fix: false }, invalidBody: { fix: "yes" } },

  // ------------------------------------------------------------------ admin: reviews / tickets
  { group: "Admin / Reviews & Support", name: "List reviews", method: "GET", path: "/api/admin/reviews", query: "status=pending", auth: "admin", desc: "Moderation queue.", invalidQuery: "status=bogus" },
  { group: "Admin / Reviews & Support", name: "Moderate review", method: "PATCH", path: "/api/admin/reviews/{{reviewId}}/moderation", auth: "admin", desc: "approved | rejected | hidden | pending. Rating summary updated atomically.", body: { status: "approved" }, invalidBody: { status: "deleted" } },
  { group: "Admin / Reviews & Support", name: "List tickets", method: "GET", path: "/api/admin/tickets", query: "status=open", auth: "admin", desc: "Admin inbox.", invalidQuery: "status=bogus" },
  { group: "Admin / Reviews & Support", name: "Ticket detail", method: "GET", path: "/api/admin/tickets/{{ticketId}}", query: "threadPage=1", auth: "admin", desc: "Paginated thread.", invalidQuery: "threadPage=0" },
  { group: "Admin / Reviews & Support", name: "Reply to ticket", method: "POST", path: "/api/admin/tickets/{{ticketId}}/reply", auth: "admin", desc: "Admin reply (ticket moves to pending).", body: { body: "We have initiated your refund." }, invalidBody: { body: "" }, expect: 201 },
  { group: "Admin / Reviews & Support", name: "Set ticket status", method: "PATCH", path: "/api/admin/tickets/{{ticketId}}/status", auth: "admin", desc: "open | pending | resolved | closed.", body: { status: "resolved" }, invalidBody: { status: "x" } },
  { group: "Admin / Reviews & Support", name: "Assign ticket to me", method: "POST", path: "/api/admin/tickets/{{ticketId}}/assign", auth: "admin", desc: "Assigns to the calling admin identity." },
  // ------------------------------------------------------------------ v2: public + customer additions
  { group: "Public", name: "Store settings (public)", method: "GET", path: "/api/settings/public", auth: "public", desc: "Tax mode, shipping fee / free-shipping threshold, return window (no GSTIN or addresses)." },
  { group: "Customer", name: "Cart", method: "GET", path: "/api/me/cart", auth: "customer", desc: "Live-priced cart with availability issues per line." },
  { group: "Customer", name: "Add to cart", method: "POST", path: "/api/me/cart/items", auth: "customer", desc: "Product (quantity) or pet (always 1). Max 50 lines.", body: { itemType: "product", productId: "{{productId}}", quantity: 2 }, invalidBody: { itemType: "product", productId: "x" }, expect: 201 },
  { group: "Customer", name: "Cart: change quantity", method: "PATCH", path: "/api/me/cart/items/{{productId}}", auth: "customer", desc: "Set a product line's quantity.", body: { quantity: 3 }, invalidBody: { quantity: 0 } },
  { group: "Customer", name: "Cart: remove line", method: "DELETE", path: "/api/me/cart/items/{{productId}}", auth: "customer", desc: "Remove by pet id or product id." },
  { group: "Customer", name: "Cart: clear", method: "DELETE", path: "/api/me/cart", auth: "customer", desc: "Empty the cart." },
  { group: "Customer", name: "Cart: coupon preview", method: "POST", path: "/api/me/cart/coupon-preview", auth: "customer", desc: "What a coupon would take off (re-validated at checkout).", body: { code: "WELCOME10" }, invalidBody: { code: "x" } },
  { group: "Customer", name: "Checkout from cart", method: "POST", path: "/api/me/cart/checkout", auth: "customer", desc: "Creates the order from the cart: server-side prices, shipping, GST, coupon. Replay with same idempotencyKey => 200.", body: { shippingAddressId: "{{addressId}}", couponCode: "WELCOME10", idempotencyKey: "cart-checkout-0001" }, invalidBody: { shippingAddressId: "x", idempotencyKey: "short" }, expect: 201 },
  { group: "Customer", name: "Invoice (GST)", method: "GET", path: "/api/me/orders/{{orderId}}/invoice", auth: "customer", desc: "Tax invoice, issued when the order ships (404 before)." },
  { group: "Customer", name: "My returns", method: "GET", path: "/api/me/returns", auth: "customer", desc: "Own return requests." },
  { group: "Customer", name: "Request a return", method: "POST", path: "/api/me/returns", auth: "customer", desc: "Delivered items within the return window. Live animals excluded by default.", body: { orderId: "{{orderId}}", orderItemId: "{{orderItemId}}", quantity: 1, reason: "damaged", details: "Arrived broken" }, invalidBody: { orderId: "{{orderId}}", orderItemId: "{{orderItemId}}", quantity: 0, reason: "bored" }, expect: 201 },
  { group: "Customer", name: "Export my data", method: "GET", path: "/api/me/privacy/export", auth: "customer", desc: "Everything held about the customer, as JSON." },
  { group: "Customer", name: "Delete my account", method: "POST", path: "/api/me/privacy/delete", auth: "customer", desc: "Anonymises the account. 409 while orders/refunds/returns/wallet balance are outstanding.", body: { confirm: "DELETE MY ACCOUNT" }, invalidBody: { confirm: "yes" } },
  { group: "Customer", name: "Sign review-photo upload", method: "POST", path: "/api/me/uploads/sign", auth: "customer", desc: "Signed Cloudinary upload (folder fixed to reviews). 503 until configured.", skipValid: true },

  // ------------------------------------------------------------------ v2: admin accounts
  { group: "Admin / Account", name: "Admin login", method: "POST", path: "/api/admin/auth/login", auth: "public", desc: "E-mail + password (+ TOTP / recovery code). 10/15 min per IP; 5 failures lock the account 15 min. Sets HttpOnly session cookie.", body: { email: "owner@petblitz.in", password: "<password>", totp: "123456" }, invalidBody: { email: "nope" }, skipValid: true },
  { group: "Admin / Account", name: "Who am I", method: "GET", path: "/api/admin/auth/me", auth: "admin", desc: "Role + permissions for the UI." },
  { group: "Admin / Account", name: "Admin logout", method: "POST", path: "/api/admin/auth/logout", auth: "admin", desc: "Revokes the session and clears the cookie." },
  { group: "Admin / Account", name: "Change my password", method: "POST", path: "/api/admin/auth/password", auth: "admin", desc: "Signs out all other sessions.", body: { current: "old-password", next: "A-new-strong-passphrase-1" }, invalidBody: { current: "x", next: "short" }, skipValid: true },
  { group: "Admin / Account", name: "MFA: start setup", method: "POST", path: "/api/admin/auth/mfa/setup", auth: "admin", desc: "Returns TOTP secret + otpauth URL (render as QR). Session accounts only.", skipValid: true },
  { group: "Admin / Account", name: "MFA: enable", method: "POST", path: "/api/admin/auth/mfa/enable", auth: "admin", desc: "Confirm with an authenticator code; returns 8 recovery codes once.", body: { code: "123456" }, invalidBody: { code: "12" }, skipValid: true },
  { group: "Admin / Account", name: "MFA: disable", method: "POST", path: "/api/admin/auth/mfa/disable", auth: "admin", desc: "Needs password + code.", body: { password: "<password>", code: "123456" }, invalidBody: { code: "1" }, skipValid: true },
  { group: "Admin / Account", name: "List admins", method: "GET", path: "/api/admin/admins", auth: "admin", desc: "Owner only." },
  { group: "Admin / Account", name: "Create admin", method: "POST", path: "/api/admin/admins", auth: "admin", desc: "Roles: owner, catalog, orders, finance, support. Password policy enforced.", body: { email: "ops@petblitz.in", name: "Ops Lead", role: "orders", password: "A-strong-passphrase-42" }, invalidBody: { email: "x", role: "god" }, expect: 201 },
  { group: "Admin / Account", name: "Update admin (role / active)", method: "PATCH", path: "/api/admin/admins/{{adminId}}", auth: "admin", desc: "Signs that admin out everywhere; last owner is protected.", body: { role: "support", isActive: true }, invalidBody: { role: "god" } },
  { group: "Admin / Account", name: "Reset admin password", method: "POST", path: "/api/admin/admins/{{adminId}}/reset-password", auth: "admin", desc: "Owner sets a new password; sessions revoked.", body: { password: "Another-strong-passphrase-7" }, invalidBody: { password: "short" } },
  { group: "Admin / Account", name: "Audit log", method: "GET", path: "/api/admin/audit-logs", query: "page=1&method=POST", auth: "admin", desc: "Every admin write / denied attempt (no request bodies).", invalidQuery: "method=GET" },

  // ------------------------------------------------------------------ v2: admin operations
  { group: "Admin / Operations", name: "Dashboard", method: "GET", path: "/api/admin/dashboard", auth: "admin", desc: "Queues + 7/30-day sales + 14-day series." },
  { group: "Admin / Operations", name: "Get settings", method: "GET", path: "/api/admin/settings", auth: "admin", desc: "Shipping rules, GST mode + seller details, return policy." },
  { group: "Admin / Operations", name: "Update settings", method: "PATCH", path: "/api/admin/settings", auth: "admin", desc: "Owner only. stateFees keyed by GST state code (33 = Tamil Nadu).", body: { shipping: { baseFeeMinor: 6000, freeAboveMinor: 99900, stateFees: { "33": 4000 } }, tax: { pricesIncludeTax: true, sellerStateCode: "33", sellerGstin: "33ABCDE1234F1Z5", legalName: "PetBlitz", invoicePrefix: "PB" }, returns: { windowDays: 7, petsReturnable: false } }, invalidBody: { tax: { sellerGstin: "BAD" } } },
  { group: "Admin / Operations", name: "List coupons", method: "GET", path: "/api/admin/coupons", query: "page=1", auth: "admin", desc: "Coupons with usage counts.", invalidQuery: "pageSize=999" },
  { group: "Admin / Operations", name: "Create coupon", method: "POST", path: "/api/admin/coupons", auth: "admin", desc: "percent (1-100) or fixed paise; limits, window, appliesTo.", body: { code: "WELCOME10", description: "10% off", type: "percent", value: 10, minOrderMinor: 50000, maxDiscountMinor: 20000, perCustomerLimit: 1 }, invalidBody: { code: "x", type: "percent", value: 500 }, expect: 201 },
  { group: "Admin / Operations", name: "Update coupon", method: "PATCH", path: "/api/admin/coupons/{{couponId}}", auth: "admin", desc: "Activate/deactivate, extend, change limits.", body: { isActive: false }, invalidBody: { code: "NEW" } },
  { group: "Admin / Operations", name: "Issue invoice", method: "POST", path: "/api/admin/orders/{{orderId}}/invoice", auth: "admin", desc: "Idempotent: one GST invoice per order.", expect: 201 },
  { group: "Admin / Operations", name: "List returns", method: "GET", path: "/api/admin/returns", query: "status=requested", auth: "admin", desc: "Return queue.", invalidQuery: "status=bogus" },
  { group: "Admin / Operations", name: "Act on return", method: "POST", path: "/api/admin/returns/{{returnId}}/action", auth: "admin", desc: "approve | reject | receive | close.", body: { action: "approve", note: "Please ship it back" }, invalidBody: { action: "delete" } },
  { group: "Admin / Operations", name: "Refund return", method: "POST", path: "/api/admin/returns/{{returnId}}/refund", auth: "admin", desc: "Finance. Received returns only; default = proportional value to wallet.", body: { destination: "wallet" }, invalidBody: { destination: "bank" } },
];

export const VARIABLES: Record<string, string> = {
  baseUrl: "http://localhost:3000", adminKey: "<ADMIN_API_KEY>", customerToken: "<run: npm run auth:dev-token -- CUSTOMER_ID>", cronSecret: "<CRON_SECRET>",
  categoryId: "", categoryId2: "", labCategoryId: "", accessoriesCategoryId: "", petId: "", productId: "", petSlug: "", productSlug: "",
  orderId: "", orderItemId: "", customerId: "", addressId: "", reviewId: "", ticketId: "", adminId: "", couponId: "", returnId: "",
};

/** `/api/admin/orders/{{orderId}}/status` -> `/api/admin/orders/[id]/status` (file-system route pattern). */
export const routePattern = (p: string) => p.replace(/\{\{(\w+)\}\}/g, (_m, v: string) => (v.endsWith("Slug") ? "[slug]" : "[id]"));
