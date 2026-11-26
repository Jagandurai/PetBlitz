"use client";
import { ReactNode } from "react";
import { Footer } from "@/components/store/footer";
import { Header, MiniCart, MiniWishlist } from "@/components/store/header";
import { AuthProvider } from "@/lib/ui/hooks";
import { StoreProvider } from "@/lib/ui/store";
import "./store.css";
import "./header.css";

/** Storefront shell. All styling is scoped under `.sf`, so the admin portal is untouched. */
export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <StoreProvider>
        <div className="sf">
          <a href="#main" style={{ position: "absolute", left: -9999 }} onFocus={(e) => (e.currentTarget.style.left = "8px")} onBlur={(e) => (e.currentTarget.style.left = "-9999px")}>Skip to content</a>
          <Header />
          <main id="main" className="sf-wrap sf-main">{children}</main>
          <Footer />
          <MiniCart />
          <MiniWishlist />
        </div>
      </StoreProvider>
    </AuthProvider>
  );
}
