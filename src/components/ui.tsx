"use client";
/* eslint-disable @next/next/no-img-element */
import { ButtonHTMLAttributes, ReactNode, useEffect, useState } from "react";
import { FaPaw } from "react-icons/fa";
import { FiX } from "react-icons/fi";
import { title, tone } from "@/lib/ui/format";

export const Spinner = () => <div className="spin" aria-label="Loading" />;
export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) => <div className="alert err">{msg} {retry && <button className="btn sm ghost" onClick={retry}>Retry</button>}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="card center muted">{children}</div>;
export const Badge = ({ status, label }: { status: string; label?: string }) => <span className={`badge ${tone(status)}`}>{label ?? title(status)}</span>;
export const Alert = ({ kind = "info", children }: { kind?: "info" | "ok" | "err" | "warn"; children: ReactNode }) => <div className={`alert ${kind}`}>{children}</div>;

export function Button({ busy, className = "", children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return <button {...p} className={`btn ${className}`} disabled={p.disabled || busy}>{busy ? "Please wait…" : children}</button>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="f">{label}{hint && <span className="hint">{hint}</span>}{children}</label>;
}
export const TextField = ({ label, hint, value, onChange, type = "text", ...r }: { label: string; hint?: string; value: string | number; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string; maxLength?: number; min?: number; step?: string; disabled?: boolean; autoComplete?: string; inputMode?: "numeric" | "decimal" | "text" }) =>
  <Field label={label} hint={hint}><input type={type} value={value} onChange={(e) => onChange(e.target.value)} {...r} /></Field>;
export const TextArea = ({ label, value, onChange, hint, ...r }: { label: string; value: string; onChange: (v: string) => void; hint?: string; maxLength?: number; rows?: number }) =>
  <Field label={label} hint={hint}><textarea value={value} onChange={(e) => onChange(e.target.value)} {...r} /></Field>;
export const Select = ({ label, value, onChange, options, hint }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; hint?: string }) =>
  <Field label={label} hint={hint}><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>;
export const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => <label className="chk"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;

export function Modal({ open, onClose, title: t, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open, onClose]);
  if (!open) return null;
  return <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-label={t}><div className="row between mb"><h2>{t}</h2><button className="btn sm ghost" onClick={onClose} aria-label="Close"><FiX /></button></div>{children}</div></div>;
}

/** Confirmation dialog for destructive actions. */
export function Confirm({ open, onClose, onConfirm, title: t, children, danger, busy, confirmLabel = "Confirm" }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; children: ReactNode; danger?: boolean; busy?: boolean; confirmLabel?: string }) {
  return <Modal open={open} onClose={onClose} title={t}><div className="col">{children}<div className="row"><Button className={danger ? "danger" : ""} busy={busy} onClick={onConfirm}>{confirmLabel}</Button><Button className="ghost" onClick={onClose}>Cancel</Button></div></div></Modal>;
}

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return <div className="pager"><Button className="ghost sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</Button><span className="muted small">Page {page} of {totalPages}</span><Button className="ghost sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next →</Button></div>;
}

/** Debounced value (search boxes). */
export function useDebounced<T>(v: T, ms = 350) { const [d, setD] = useState(v); useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]); return d; }

export const Img = ({ src, alt, className }: { src?: string | null; alt: string; className?: string }) =>
  src ? <img src={src} alt={alt} className={className} loading="lazy" /> : <div className={className} style={{ background: "#efe9dd", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem" }} aria-label={alt}><FaPaw color="#b9ad96" /></div>;

