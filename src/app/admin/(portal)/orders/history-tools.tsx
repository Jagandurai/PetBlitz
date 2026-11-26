"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiArchive, FiEye, FiMoreVertical, FiRotateCcw, FiTrash2 } from "react-icons/fi";
import { Button, Modal, Select, TextField } from "@/components/ui";
import { api } from "@/lib/ui/api";
import { useAdmin } from "@/lib/ui/admin";
import { useAction } from "@/lib/ui/hooks";
import "./orders.css";

export interface HistoryRow { _id: string; orderNumber: string; status: string; archivedAt?: string }
const FINISHED = ["delivered", "cancelled", "refunded"];
type Ask = "archive" | "delete" | null;

/** The three-dot menu at the end of an order row. */
export function RowMenu({ order, onChanged }: { order: HistoryRow; onChanged: () => void }) {
  const { can } = useAdmin();
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null), [ask, setAsk] = useState<Ask>(null);
  const button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const outside = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); button.current?.focus(); } };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", key); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [pos]);
  // fixed position, so the scrolling table cannot clip it; it opens upwards near the bottom of the screen
  const open = () => {
    if (pos) { setPos(null); return; }
    const r = button.current!.getBoundingClientRect(), height = 150;
    setPos({ top: r.bottom + height > window.innerHeight ? r.top - height : r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };
  const archived = !!order.archivedAt;
  const restore = async () => { setPos(null); if (await run(() => api(`/api/admin/orders/${order._id}/archive`, { method: "PATCH", body: { archived: false } }), "Order restored")) onChanged(); };
  const confirm = async () => {
    const done = ask === "delete"
      ? await run(() => api(`/api/admin/orders/${order._id}`, { method: "DELETE" }), "Order deleted")
      : await run(() => api(`/api/admin/orders/${order._id}/archive`, { method: "PATCH", body: { archived: true } }), "Order archived");
    if (done) { setAsk(null); onChanged(); }
  };
  return (
    <>
      <button ref={button} type="button" className="ord-dots" aria-haspopup="menu" aria-expanded={!!pos} aria-label={`Actions for order ${order.orderNumber}`} onClick={open}><FiMoreVertical aria-hidden="true" /></button>
      {pos && (
        <div ref={menu} className="ord-menu" role="menu" style={pos}>
          <Link role="menuitem" href={`/admin/orders/${order._id}`}><FiEye aria-hidden="true" /> View order</Link>
          {can("orders.write") && (archived
            ? <button type="button" role="menuitem" onClick={restore}><FiRotateCcw aria-hidden="true" /> Restore</button>
            : <button type="button" role="menuitem" onClick={() => { setPos(null); setAsk("archive"); }}><FiArchive aria-hidden="true" /> Archive</button>)}
          {can("system") && <button type="button" role="menuitem" className="danger" onClick={() => { setPos(null); setAsk("delete"); }}><FiTrash2 aria-hidden="true" /> Delete</button>}
        </div>
      )}
      <Modal open={!!ask} onClose={() => setAsk(null)} title={ask === "delete" ? "Delete order?" : "Archive order?"}>
        <div className="col ord-dialog">
          {ask === "delete"
            ? <p>Permanently delete <strong>{order.orderNumber}</strong>? This cannot be undone. Only cancelled orders with no payment, invoice, return or review can be deleted.</p>
            : <p>Archive <strong>{order.orderNumber}</strong>? It moves to the Archived tab and can be restored at any time. The customer still sees it.</p>}
          {ask === "archive" && !FINISHED.includes(order.status) && <p className="ord-warn">This order is not finished yet. Make sure it needs no more work before hiding it.</p>}
          <div className="row"><Button className={ask === "delete" ? "danger" : ""} busy={busy} onClick={confirm}>{ask === "delete" ? "Delete permanently" : "Archive"}</Button><Button className="ghost" onClick={() => setAsk(null)}>Cancel</Button></div>
        </div>
      </Modal>
    </>
  );
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
interface Result { total: number; affected: number; kept: number; done: boolean; more?: boolean }
type Action = "archive" | "restore" | "delete";

/** Archive, restore or delete every order placed in a date range. Nothing happens before the count has been shown. */
export function ClearHistory({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { can } = useAdmin();
  const [from, setFrom] = useState(""), [to, setTo] = useState(daysAgo(90)), [action, setAction] = useState<Action>("archive");
  const [preview, setPreview] = useState<Result | null>(null), [typed, setTyped] = useState("");
  const { busy, run } = useAction();
  const reset = () => { setPreview(null); setTyped(""); };
  const call = (dryRun: boolean) => {
    // whole days in the admin's own time zone
    const body = { from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: new Date(`${to}T23:59:59.999`).toISOString(), preview: dryRun };
    return action === "delete"
      ? api<Result>("/api/admin/orders/delete-range", { method: "POST", body })
      : api<Result>("/api/admin/orders/archive-range", { method: "POST", body: { ...body, archived: action === "archive" } });
  };
  const invalid = !to || (!!from && from > to);
  const verb = action === "delete" ? "Delete" : action === "restore" ? "Restore" : "Archive";
  const apply = async () => {
    const r = await run(() => call(false));
    if (!r) return;
    await run(async () => r, `${r.affected} order${r.affected === 1 ? "" : "s"} ${action === "delete" ? "deleted" : action === "restore" ? "restored" : "archived"}`);
    reset(); onClose(); onChanged();
  };
  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Clear order history">
      <div className="col ord-dialog">
        <Select label="What to do" value={action} onChange={(v) => { setAction(v as Action); reset(); }} options={[{ value: "archive", label: "Archive finished orders (safe, can be restored)" }, { value: "restore", label: "Restore archived orders" }, ...(can("system") ? [{ value: "delete", label: "Delete permanently (unpaid cancelled orders only)" }] : [])]} />
        <div className="ord-presets" role="group" aria-label="Quick ranges">
          {[30, 90, 180, 365].map((n) => <button key={n} type="button" className={!from && to === daysAgo(n) ? "on" : ""} onClick={() => { setFrom(""); setTo(daysAgo(n)); reset(); }}>Older than {n === 365 ? "1 year" : `${n} days`}</button>)}
        </div>
        <div className="ord-dates">
          <TextField label="From (empty = the beginning)" type="date" value={from} onChange={(v) => { setFrom(v); reset(); }} />
          <TextField label="To" type="date" value={to} onChange={(v) => { setTo(v); reset(); }} />
        </div>
        {from && to && from > to && <p className="ord-warn">The From date is after the To date.</p>}
        {!preview ? <Button busy={busy} disabled={invalid} onClick={async () => { const r = await run(() => call(true)); if (r) setPreview(r); }}>Check how many orders</Button> : (
          <>
            <div className="ord-result" role="status">
              <b>{preview.affected} order{preview.affected === 1 ? "" : "s"} will be {action === "delete" ? "permanently deleted" : action === "restore" ? "restored" : "archived"}.</b>
              {preview.kept > 0 && <span>{preview.kept} other order{preview.kept === 1 ? "" : "s"} in this range will stay{action === "delete" ? " (paid, not cancelled, recently cancelled, or linked to records)" : action === "archive" ? " because they are not finished" : ""}.</span>}
              {preview.more && <span>This run covers the oldest 500 candidates. Run it again for the rest.</span>}
            </div>
            {action === "delete" && preview.affected > 0 && <TextField label="Type DELETE to confirm" value={typed} onChange={setTyped} autoComplete="off" />}
            <div className="row">
              <Button className={action === "delete" ? "danger" : ""} busy={busy} disabled={!preview.affected || (action === "delete" && typed !== "DELETE")} onClick={apply}>{verb} {preview.affected} order{preview.affected === 1 ? "" : "s"}</Button>
              <Button className="ghost" onClick={reset}>Change</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
