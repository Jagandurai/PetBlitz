import type { Metadata } from "next";
import CartView from "@/components/store/cart";

export const metadata: Metadata = { title: "Shopping cart", robots: { index: false } };
export default function Page() { return <CartView />; }
