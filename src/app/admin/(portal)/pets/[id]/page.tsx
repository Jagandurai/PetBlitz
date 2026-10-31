"use client";
import { useParams } from "next/navigation";
import { CatalogForm } from "@/components/admin-catalog";

export default function Page() { const { id } = useParams<{ id: string }>(); return <CatalogForm kind="pet" id={id} />; }
