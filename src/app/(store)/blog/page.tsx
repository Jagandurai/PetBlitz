import type { Metadata } from "next";
import { Suspense } from "react";
import BlogListing from "@/components/blog/listing";
import { GridSkeleton } from "@/components/store/ui";

const title = "Blog";
const description = "Guides, care tips and product advice from PetBlitz.";

export function generateMetadata(): Metadata {
  const url = `${process.env.APP_ORIGIN ?? "http://localhost:3000"}/blog`;
  return { title, description, alternates: { canonical: url }, openGraph: { title: `${title} · PetBlitz`, description, type: "website", url, images: [{ url: new URL("/logo.png", url).href }] } };
}

export default function Page() { return <Suspense fallback={<GridSkeleton n={3} />}><BlogListing /></Suspense>; }
