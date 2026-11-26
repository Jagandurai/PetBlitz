"use client";
import Link from "next/link";
import { FiLock } from "react-icons/fi";
import { OrderList } from "@/components/store/order-list";
import "@/components/store/order-list.css";
import { useAuth } from "@/lib/ui/hooks";

export default function TrackOrder() {
  const { me, loading } = useAuth();
  if (loading) return null;
  return (
    <div className="od-page">
      <header className="od-head">
        <h1>Track your order</h1>
        <p>Follow each order below, or open it to see shipping details.</p>
      </header>
      {me ? <div className="od-wrap"><OrderList /></div> : (
        <div className="od-empty">
          <i><FiLock aria-hidden="true" /></i>
          <b>Sign in to track your orders</b>
          <p>Your orders are saved to your account.</p>
          <Link href="/login?next=%2Ftrack-order" className="od-btn">Sign in</Link>
        </div>
      )}
    </div>
  );
}
