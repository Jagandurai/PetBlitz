import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cdn, pctOff } from "@/lib/ui/store";
import { PriceBox } from "@/components/store/summary";
import { Crumbs, Pagination, PriceTag, Stars } from "@/components/store/ui";
import { SpecTable } from "@/components/store/pdp-parts";
import { addrValid, emptyAddr } from "@/components/store/form";
import { animalLabel, catHref, Quote } from "@/components/store/types";
import { productListQuery } from "@/validations/product.validation";
import { facetsQuery } from "@/validations/catalog.validation";
import { quoteSchema } from "@/validations/cart.validation";

const h = React.createElement;
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("storefront helpers", () => {
  it("cdn() adds Cloudinary resize/format only for Cloudinary upload URLs", () => {
    expect(cdn("https://res.cloudinary.com/demo/image/upload/v1700000000/petblitz/pets/a.jpg", 480)).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_480/v1700000000/petblitz/pets/a.jpg");
    expect(cdn("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
    expect(cdn(undefined)).toBeUndefined();
  });
  it("percentage off, labels and links are data-driven", () => {
    expect(pctOff(10000, 7500)).toBe(25);
    expect(pctOff(10000, 10000)).toBe(0);
    expect(pctOff(0, 0)).toBe(0);
    expect(animalLabel("guinea_pig")).toBe("Guinea pig");
    expect(catHref({ slug: "toys" })).toBe("/products?category=toys");
  });
  it("address validation", () => {
    const ok = { ...emptyAddr, recipientName: "Asha K", phone: "+91 98765 43210", line1: "12 Park St", city: "Chennai", postalCode: "600001" };
    expect(addrValid(ok)).toBe(true);
    expect(addrValid({ ...ok, postalCode: "6000" })).toBe(false);
    expect(addrValid({ ...ok, phone: "abc" })).toBe(false);
    expect(addrValid({ ...ok, recipientName: "" })).toBe(false);
  });
});

describe("storefront components render (server-side, no browser)", () => {
  it("PriceTag shows MRP, saving percentage and formats rupees", () => {
    const out = html(h(PriceTag, { p: { price: 129900, finalPrice: 99900, discountType: "fixed", discountValue: 30000 } }));
    expect(out).toContain("₹999.00"); expect(out).toContain("₹1,299.00"); expect(out).toContain("23% off");
    expect(html(h(PriceTag, { p: { price: 5000, finalPrice: 5000, discountType: "none", discountValue: 0 } }))).not.toContain("% off");
  });
  it("Stars: accessible label and fill width; nothing when unrated (card) / message (detail)", () => {
    const out = html(h(Stars, { r: { count: 12, average: 4.5 } }));
    expect(out).toContain("Rated 4.5 out of 5 from 12 reviews"); expect(out).toContain("width:90%");
    expect(html(h(Stars, { r: { count: 0, average: null } }))).toBe("");
    expect(html(h(Stars, { r: { count: 0, average: null }, big: true }))).toContain("No reviews yet");
  });
  it("Pagination collapses long ranges and marks the current page", () => {
    const out = html(h(Pagination, { page: 5, totalPages: 20, onPage: () => undefined }));
    expect(out).toContain('aria-current="page"'); expect(out).toContain("…"); expect(out).toContain(">20<");
    expect(html(h(Pagination, { page: 1, totalPages: 1, onPage: () => undefined }))).toBe("");
  });
  it("Crumbs: links for ancestors, aria-current for the last item", () => {
    const out = html(h(Crumbs, { items: [{ label: "Home", href: "/" }, { label: "Accessories", href: "/products" }, { label: "Rope Toy" }] }));
    expect(out).toContain('href="/products"'); expect(out).toContain('aria-current="page"'); expect(out).toContain("Rope Toy");
  });
  it("SpecTable skips empty rows", () => {
    const out = html(h(SpecTable, { rows: [["Brand", "Acme"], ["Colour", undefined], ["Weight", ""]] }));
    expect(out).toContain("Acme"); expect(out).not.toContain("Colour"); expect(out).not.toContain("Weight");
  });
  const q = (over: Partial<Quote> = {}): Quote => ({ lines: [{ key: "a", name: "Ball", quantity: 2, unitPrice: 9000, listPrice: 10000, lineTotal: 18000 }], subtotal: 20000, discountTotal: 4000, shippingTotal: 6000, taxTotal: 2748, grandTotal: 24000, couponDiscount: 2000, couponCode: "SAVE10", pricesIncludeTax: true, itemSavings: 2000, freeShippingRemaining: 0, freeShippingThreshold: null, hasIssues: false, issues: [], ...over });
  it("PriceBox: inclusive GST is informational, free shipping labelled, savings shown", () => {
    const out = html(h(PriceBox, { q: q({ shippingTotal: 0, grandTotal: 18000 }) }));
    expect(out).toContain("FREE"); expect(out).toContain("Includes GST of ₹27.48"); expect(out).toContain("Coupon (SAVE10)"); expect(out).toContain("₹40.00"); expect(out).toContain("Total");
  });
  it("PriceBox: exclusive GST appears as its own line", () => {
    const out = html(h(PriceBox, { q: q({ pricesIncludeTax: false }) }));
    expect(out).toContain("<span>GST</span>"); expect(out).not.toContain("Includes GST");
  });
});

describe("storefront-facing API contracts", () => {
  it("multi-brand + onSale accepted; unknown keys and oversized pages rejected", () => {
    expect(productListQuery.parse({ brand: "Pedigree,Royal Canin", onSale: "true" }).onSale).toBe(true);
    expect(productListQuery.safeParse({ brand: "x".repeat(401) }).success).toBe(false);
    expect(productListQuery.safeParse({ pageSize: "500" }).success).toBe(false);
    expect(productListQuery.safeParse({ nope: "1" }).success).toBe(false);
  });
  it("facets and quote inputs are strict", () => {
    expect(facetsQuery.safeParse({ kind: "products" }).success).toBe(true);
    expect(facetsQuery.safeParse({ kind: "pets" }).success).toBe(false);
    expect(facetsQuery.safeParse({ kind: "orders" }).success).toBe(false);
    expect(quoteSchema.safeParse({ shippingAddressId: "507f1f77bcf86cd799439011", couponCode: "SAVE10" }).success).toBe(true);
    expect(quoteSchema.safeParse({ shippingAddressId: "x" }).success).toBe(false);
    expect(quoteSchema.safeParse({ grandTotal: 1 }).success).toBe(false);
  });
});
