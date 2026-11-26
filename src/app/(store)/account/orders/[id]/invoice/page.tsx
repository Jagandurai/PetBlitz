"use client";
import { useParams } from "next/navigation";
import { Button, ErrorBox, Spinner } from "@/components/ui";
import { dt, inr } from "@/lib/ui/format";
import { useApi } from "@/lib/ui/hooks";

interface Inv { invoiceNumber: string; issuedAt: string; placeOfSupply: string; pricesIncludeTax?: boolean; seller: { legalName?: string; gstin?: string; address?: string; stateCode?: string }; buyer: { name?: string; email?: string; address?: string }; lines: { description: string; hsnCode?: string; quantity: number; taxableValue: number; taxRateBps: number; cgst: number; sgst: number; igst: number; total: number }[]; shipping: number; totals: { taxable: number; cgst: number; sgst: number; igst: number; grandTotal: number } }

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { data: v, loading, error } = useApi<Inv>(`/api/me/orders/${id}/invoice`);
  if (loading) return <Spinner />;
  if (error || !v) return <ErrorBox msg={error === "Invoice not found" || !v ? "The invoice is issued when your order ships. Check back soon." : error!} />;
  return (
    <div className="card col">
      <div className="row between noprint"><h1>Tax invoice</h1><Button onClick={() => window.print()}>Print / Save PDF</Button></div>
      <div className="row between"><div><strong>{v.seller.legalName ?? "PetBlitz"}</strong><div className="small">{v.seller.address}</div>{v.seller.gstin && <div className="small">GSTIN: {v.seller.gstin}</div>}</div><div className="right"><div><strong>{v.invoiceNumber}</strong></div><div className="small">{dt(v.issuedAt)}</div><div className="small">Place of supply: {v.placeOfSupply}</div></div></div>
      <div className="small"><strong>Bill to:</strong> {v.buyer.name} · {v.buyer.email}<br />{v.buyer.address}</div>
      <div className="tw"><table className="t"><thead><tr><th>Description</th><th>HSN</th><th className="right">Qty</th><th className="right">Taxable</th><th className="right">GST %</th><th className="right">CGST</th><th className="right">SGST</th><th className="right">IGST</th><th className="right">Total</th></tr></thead><tbody>
        {v.lines.map((l, i) => <tr key={i}><td>{l.description}</td><td>{l.hsnCode ?? "—"}</td><td className="right">{l.quantity}</td><td className="right">{inr(l.taxableValue)}</td><td className="right">{l.taxRateBps / 100}</td><td className="right">{inr(l.cgst)}</td><td className="right">{inr(l.sgst)}</td><td className="right">{inr(l.igst)}</td><td className="right">{inr(l.total)}</td></tr>)}
        <tr><td colSpan={8}>Shipping</td><td className="right">{inr(v.shipping)}</td></tr>
        <tr><td colSpan={3}><strong>Total</strong></td><td className="right"><strong>{inr(v.totals.taxable)}</strong></td><td /><td className="right">{inr(v.totals.cgst)}</td><td className="right">{inr(v.totals.sgst)}</td><td className="right">{inr(v.totals.igst)}</td><td className="right"><strong>{inr(v.totals.grandTotal)}</strong></td></tr>
      </tbody></table></div>
      <p className="small muted">{v.pricesIncludeTax ? "Prices include GST." : "GST added as shown."} This is a computer-generated invoice.</p>
    </div>
  );
}
