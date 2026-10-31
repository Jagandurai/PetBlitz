"use client";
import { Suspense } from "react";
import Listing from "@/components/listing";
import { Spinner } from "@/components/ui";

export default function Page() { return <Suspense fallback={<Spinner />}><Listing kind="pets" fixedType="dog" basePath="/dogs" heading="Dogs" /></Suspense>; }
