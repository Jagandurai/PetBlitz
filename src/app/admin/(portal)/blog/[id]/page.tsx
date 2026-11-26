"use client";
import { useParams } from "next/navigation";
import BlogEditorPage from "@/components/blog/admin-editor";

export default function Page() { const { id } = useParams<{ id: string }>(); return <BlogEditorPage key={id} id={id} />; }
