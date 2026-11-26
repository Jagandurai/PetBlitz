# PetBlitz storefront (customer site)

Everything under `src/app/(store)`, `src/components/store`, `src/lib/ui/store.tsx`. All styling lives in `src/app/(store)/store.css`, **scoped under `.sf`**, so the admin portal is unaffected (no admin file was changed).

## Pages
| Route | What it is |
|---|---|
| `/` | Biscuit hero, Shop by Category (five fixed tiles), four promotional banners (admin > Promotional Banners: heading, paragraph, image), New Arrivals, Recently Viewed, Our Promise |
| `/products` | Accessories catalog. Filters in the URL (shareable): category tree, brand (multi), suitable-for, price (quick ranges + custom), in-stock, on-offer, sort, pagination; active-filter chips; mobile filter drawer |
| `/products/[slug]` | **Server-rendered** (SEO): metadata, canonical, Open Graph, JSON-LD Product schema. Zoom gallery + lightbox, savings, stock status, quantity, Add to cart / Buy now, wishlist, share, delivery estimate, tabs (description / specs / reviews with rating breakdown), related items, sticky mobile buy bar |
| `/search?q=` | Product results; header search has live suggestions (categories, products) |
| `/wishlist` | Saved items (stored on the device, refreshed with live price/availability) |
| `/cart` | Live-priced lines, qty, save-for-later, free-shipping progress, coupon, exact price details |
| `/checkout` | 3 steps: address → review & coupon → payment (Razorpay UPI/cards/netbanking or wallet). Totals come from the server quote (`POST /api/me/cart/quote`): shipping for the chosen address, GST, coupon |
| `/order-confirmed/[id]` | Confirmation, auto-refreshing while payment is being verified |
| `/account/*`, `/track-order`, `/faq`, `/about`, `/contact`, policy pages | Account area (restyled shell), FAQ (new), your existing content pages |
| `/accessories` | Permanent (308) redirect to `/products` |
| `/sitemap.xml`, `/robots.txt` | Generated from live published items |

## Backend additions the storefront needed (public/customer only)
`GET /api/catalog/facets`, `POST /api/me/cart/quote`; list filters `onSale`, multi-`brand`.

## Known limits (be aware)
* **Not browser-tested**: built and type-checked, server-render smoke-tested, 13 render/helper tests, but I could not look at it in a browser (layout/mobile/accessibility need your eyes).
* Wishlist is per-device (localStorage), not synced to the account.
* The delivery PIN check is an **estimate** (no courier serviceability API yet).
* Rating distribution is computed from the first 50 reviews.
* Product images: upload via the admin (Cloudinary). Without images, cards show a paw placeholder.
* CSP allows inline scripts (Next.js); see docs/OPERATIONS.md.
