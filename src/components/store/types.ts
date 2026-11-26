export interface Media { kind: string; url: string; alt?: string; isPrimary?: boolean }
export interface Pricing { price: number; finalPrice: number; discountType: string; discountValue: number; currency?: string }
export interface Rating { count: number; average: number | null }
export interface CatRef { id: string; name: string; slug: string }
export interface ProductData { id: string; sku?: string; name: string; slug: string; shortDescription?: string; description?: string; productType?: string; category?: CatRef; compatibility?: string[]; brand?: string; specifications?: { key: string; value: string }[]; material?: string; colors?: string[]; sizes?: string[]; media: Media[]; pricing: Pricing; stockStatus: string; isFeatured?: boolean; isNewArrival?: boolean; isTopSelling?: boolean; rating: Rating }
export interface CatNode { id: string; name: string; slug: string; type: string; level: number; image?: { url: string }; children: CatNode[] }
export interface CartLine { key: string; itemType: "product"; id: string; quantity: number; name: string; slug?: string; image?: string; unitPrice: number; listPrice: number; lineTotal: number; available: boolean; maxQuantity: number; issue?: string }
export interface CartData { items: CartLine[]; itemCount: number; subtotal: number; hasIssues: boolean }
export interface PublicSettings { googleClientId: string | null; pricesIncludeTax: boolean; shipping: { baseFeeMinor: number; freeAboveMinor: number | null }; returns: { windowDays: number } }
export interface Quote { lines: { key: string; name: string; image?: string; slug?: string; quantity: number; unitPrice: number; listPrice: number; lineTotal: number }[]; subtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number; grandTotal: number; couponCode?: string; couponDiscount: number; couponError?: string; pricesIncludeTax: boolean; itemSavings: number; freeShippingRemaining: number; freeShippingThreshold: number | null; hasIssues: boolean; issues: { key: string; name: string; issue?: string }[] }
export const animalLabel = (v: string) => v.replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export const catHref = (c: { slug: string }) => `/products?category=${c.slug}`;
