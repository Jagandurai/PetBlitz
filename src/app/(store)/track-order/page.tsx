"use client";
import Link from "next/link";
import { Empty } from "@/components/ui";
import { useAuth } from "@/lib/ui/hooks";
import Orders from "../account/orders/page";

export default function TrackOrder() {
  const { me, loading } = useAuth();
  if (loading) return null;
  if (!me) return <Empty>Please <Link href="/login?next=%2Ftrack-order">sign in</Link> to track your orders.</Empty>;
  return <><p className="muted">Select an order to see its live status and shipping details.</p><Orders /></>;
}
