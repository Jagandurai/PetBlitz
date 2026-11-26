import type { Metadata } from "next";
import CheckoutView from "@/components/store/checkout";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export default function Page() { return <CheckoutView />; }
