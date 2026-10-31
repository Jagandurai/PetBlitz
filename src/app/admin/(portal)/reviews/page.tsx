"use client";
import { useState } from "react";
import { Badge, Button, Empty, ErrorBox, Modal, Pager, Select, Spinner, TextField } from "@/components/ui";
import { api, qs } from "@/lib/ui/api";
import { Can } from "@/lib/ui/admin";
import { day } from "@/lib/ui/format";
import { useAction, useApi } from "@/lib/ui/hooks";

interface R { _id: string; rating: number; title?: string; comment?: string; status: string; targetType: string; verifiedPurchase: boolean; createdAt: string; images?: { url: string }[] }

export default function Reviews() {
  const [status, setStatus] = useState("pending"), [page, setPage] = useState(1), [pick, setPick] = useState<{ r: R; to: string } | null>(null), [reason, setReason] = useState("");
  const { data, loading, error, reload } = useApi<{ items: R[]; totalPages: number }>(`/api/admin/reviews${qs({ status, page, pageSize: 20 })}`);
  const { busy, run } = useAction();
  const set = async (r: R, to: string, why?: string) => { if (await run(() => api(`/api/admin/reviews/${r._id}/moderation`, { method: "PATCH", body: { status: to, reason: why || undefined } }), `Review ${to}`)) { setPick(null); setReason(""); reload(); } };
  return (
    <div className="set pl">
      <div className="top"><div><h1>Reviews</h1><p className="muted small" style={{ margin: 0 }}>Moderate customer reviews before they appear on the storefront.</p></div></div>
      <div className="set-tabs rt-tabs" role="tablist">{["pending", "approved", "rejected", "hidden"].map((v) => <button key={v} role="tab" aria-selected={status === v} className={status === v ? "on" : ""} onClick={() => { setStatus(v); setPage(1); }}><span style={{ display: "inline" }}>{v[0]!.toUpperCase() + v.slice(1)}</span></button>)}</div>
      {loading ? <Spinner /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.items.length ? <Empty>Nothing in this queue</Empty> : data.items.map((r) => (
        <div key={r._id} className="set-card rt-card rv-card"><div className="rt-head"><div className="rv-top"><span className="rv-stars" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}<i>{"★".repeat(5 - r.rating)}</i></span><Badge status={r.status} /><span className="rv-chip">{r.targetType}</span>{r.verifiedPurchase && <span className="rv-chip rv-ok">✓ Verified purchase</span>}</div><span className="small muted">{day(r.createdAt)}</span></div>
          {(r.title || r.comment) && <div className="rv-body">{r.title && <strong>{r.title}</strong>}{r.comment && <p>{r.comment}</p>}</div>}{r.images?.length ? <div className="small muted">{r.images.length} photo(s): {r.images.map((im, i) => <a key={i} href={im.url} target="_blank" rel="noopener noreferrer">view {i + 1} </a>)}</div> : null}
          <Can perm="reviews.moderate"><div className="rt-foot"><span className="small muted">Moderation</span><div className="row">{r.status !== "approved" && <Button className="sm" onClick={() => set(r, "approved")} busy={busy}>Approve</Button>}{r.status !== "rejected" && <Button className="ghost sm" onClick={() => setPick({ r, to: "rejected" })}>Reject</Button>}{r.status !== "hidden" && <Button className="ghost sm" onClick={() => setPick({ r, to: "hidden" })}>Hide</Button>}</div></div></Can></div>))}
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
      <Modal open={!!pick} onClose={() => setPick(null)} title={`Mark as ${pick?.to}`}><div className="col"><TextField label="Reason (internal)" value={reason} onChange={setReason} /><Button busy={busy} onClick={() => pick && set(pick.r, pick.to, reason)}>Confirm</Button></div></Modal>
    </div>
  );
}
