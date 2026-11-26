import type { Metadata } from "next";
import { Suspense } from "react";
import SearchView from "@/components/store/search";
import { GridSkeleton } from "@/components/store/ui";

export const metadata: Metadata = { title: "Search", robots: { index: false } };
export default function Page() { return <Suspense fallback={<GridSkeleton />}><SearchView /></Suspense>; }
