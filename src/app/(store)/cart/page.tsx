"use client";
import Link from "next/link";
import { FiTrash2 } from "react-icons/fi";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Empty, ErrorBox, Img, Spinner } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { inr } from "@/lib/ui/format";
import { useAction, useApi, useAuth } from "@/lib/ui/hooks";

export interface CartLine { key: string; itemType: "pet" | "product"; id: string; quantity: number; name: string; slug?: string; image?: string; unitPrice: number; lineTotal: number; available: boolean; maxQuantity: number; issue?: string }
export interface CartData { items: CartLine[]; itemCount: number; subtotal: number; hasIssues: boolean }

export default function CartPage() {
  const { me, loading: authLoading, refreshCart } = useAuth();
  const router = useRouter();
  const { data, loading, error, reload, setData } = useApi<CartData>(me ? "/api/me/cart" : null);
  const { busy, run } = useAction();
  if (authLoading) return <Spinner />;
  if (!me) return <Empty>Please <Link href="/login?next=/cart">sign in</Link> to see your cart.</Empty>;
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error ?? "Could not load cart"} retry={reload} />;
  const change = async (l: CartLine, q: number) => { const r = await run(() => api<CartData>(`/api/me/cart/items/${l.id}`, { method: "PATCH", body: { quantity: q } })); if (r) { setData(r); await refreshCart(); } };
  const remove = async (l: CartLine) => { const r = await run(() => api<CartData>(`/api/me/cart/items/${l.id}`, { method: "DELETE" })); if (r) { setData(r); await refreshCart(); } };
  if (!data.items.length) return <Empty>Your cart is empty. <Link href="/pets">Browse pets</Link> or <Link href="/products">accessories</Link>.</Empty>;
  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 320px", alignItems: "start" }}>
      <div className="col"><h1>Your cart</h1>
        {data.items.map((l) => (
          <div key={l.key} className="card row" style={{ opacity: l.available ? 1 : 0.7 }}>
            <Img src={l.image} alt={l.name} className="" /><div className="grow"><Link href={`/${l.itemType === "pet" ? "pets" : "products"}/${l.slug}`}><strong>{l.name}</strong></Link>
              <div className="muted small">{inr(l.unitPrice)}{l.itemType === "pet" && " · 1 pet"}</div>{l.issue && <Badge status="bad" label={l.issue} />}</div>
            {l.itemType === "product" && <div className="qty"><button aria-label="Decrease" disabled={busy || l.quantity <= 1} onClick={() => change(l, l.quantity - 1)}>−</button><span>{l.quantity}</span><button aria-label="Increase" disabled={busy || l.quantity >= l.maxQuantity} onClick={() => change(l, l.quantity + 1)}>+</button></div>}
            <strong className="nowrap">{inr(l.lineTotal)}</strong><Button className="ghost sm" onClick={() => remove(l)} aria-label={`Remove ${l.name}`}><FiTrash2 /></Button>
          </div>
        ))}
      </div>
      <aside className="card col"><h2>Summary</h2>
        <div className="row between"><span>Subtotal ({data.itemCount} items)</span><strong>{inr(data.subtotal)}</strong></div>
        <p className="small muted">Shipping, GST and coupons are calculated at checkout.</p>
        {data.hasIssues && <Alert kind="warn">Some items are unavailable. Remove them or adjust quantities to continue.</Alert>}
        <Button disabled={data.hasIssues} onClick={() => router.push("/checkout")}>Proceed to checkout</Button>
      </aside>
    </div>
  );
}

