import Link from "next/link";
import { Empty } from "@/components/store/ui";

export default function NotFound() {
  return <Empty icon="🐕‍🦺" title="We couldn't find that page" action={<div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}><Link className="sf-btn" href="/">Go home</Link><Link className="sf-btn ghost" href="/products">Shop accessories</Link></div>}>The link may be old, or the item may no longer be available.</Empty>;
}
