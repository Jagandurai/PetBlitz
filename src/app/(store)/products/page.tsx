import type { Metadata } from "next";
import { Suspense } from "react";
import Catalog from "@/components/store/catalog";
import { GridSkeleton } from "@/components/store/ui";

export const metadata: Metadata = { title: "Pet accessories", description: "Food, toys, grooming and essentials for your pet. Filter by brand, price and more." };
export default function Page() { return <Suspense fallback={<GridSkeleton />}><Catalog /></Suspense>; }
