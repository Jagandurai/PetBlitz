import type { Metadata } from "next";
import Confirmed from "@/components/store/confirmed";

export const metadata: Metadata = { title: "Order confirmed", robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <Confirmed id={(await params).id} />; }
