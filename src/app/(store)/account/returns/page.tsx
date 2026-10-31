"use client";
import Link from "next/link";
import { Badge, Empty, ErrorBox, Spinner } from "@/components/ui";
import { day, inr, title } from "@/lib/ui/format";
import { useApi } from "@/lib/ui/hooks";

export default function Returns() {
  const { data, loading, error, reload } = useApi<{ items: { _id: string; returnNumber: string; orderId: string; quantity: number; reason: string; status: string; refundAmount?: number; createdAt: string }[] }>("/api/me/returns?pageSize=50");
  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} retry={reload} />;
  return (
    <>
      <h1>Returns</h1>
      {!data?.items.length ? <Empty>No return requests. You can request one from a delivered <Link href="/account/orders">order</Link>.</Empty> : data.items.map((r) => <div key={r._id} className="card row between"><div><strong>{r.returnNumber}</strong> · {r.quantity} item(s) · {title(r.reason)}<div className="small muted">{day(r.createdAt)} · <Link href={`/account/orders/${r.orderId}`}>order</Link></div></div><div className="row">{r.refundAmount ? <span>{inr(r.refundAmount)}</span> : null}<Badge status={r.status} /></div></div>)}
    </>
  );
}
