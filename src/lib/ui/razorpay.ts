import { api } from "./api";

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open(): void; on(ev: string, cb: (r: { error?: { description?: string } }) => void): void } } }

let loading: Promise<void> | null = null;
export function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = () => res(); s.onerror = () => { loading = null; rej(new Error("Could not load the payment window. Check your connection.")); }; document.head.appendChild(s); });
  return loading;
}

export interface RzpOrder { keyId: string; razorpayOrderId: string; amount: number; currency: string }
interface Confirm { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }

/** Opens Razorpay Checkout for an already-created Razorpay order and resolves with the signed result (or rejects if dismissed / failed). */
export async function openCheckout(o: RzpOrder, prefill: { name?: string; email?: string; contact?: string }, description: string): Promise<Confirm> {
  await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rz = new window.Razorpay!({ key: o.keyId, amount: o.amount, currency: o.currency, order_id: o.razorpayOrderId, name: "PetBlitz", description, prefill, theme: { color: "#0f766e" }, handler: (r: Confirm) => resolve(r), modal: { ondismiss: () => reject(new Error("Payment cancelled")) } });
    rz.on("payment.failed", (r) => reject(new Error(r.error?.description ?? "Payment failed")));
    rz.open();
  });
}

/** Pay an order: create the Razorpay order (amount comes from the server), open Checkout, then have the server verify the signature. */
export async function payOrderWithRazorpay(orderId: string, prefill: { name?: string; email?: string; contact?: string }) {
  const o = await api<RzpOrder>(`/api/me/orders/${orderId}/pay/razorpay`, { method: "POST" });
  const r = await openCheckout(o, prefill, "PetBlitz order");
  return api<{ handled: boolean; reason?: string }>("/api/me/payments/razorpay/confirm", { method: "POST", body: r });
}

export async function topUpWallet(amount: number, prefill: { name?: string; email?: string; contact?: string }) {
  const o = await api<RzpOrder>("/api/me/wallet/topup", { method: "POST", body: { amount } });
  const r = await openCheckout(o, prefill, "Wallet top-up");
  return api<{ handled: boolean }>("/api/me/payments/razorpay/confirm", { method: "POST", body: r });
}
