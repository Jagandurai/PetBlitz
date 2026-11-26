"use client";
import { useEffect, useRef } from "react";
import { LuEyeOff, LuTrash2, LuX } from "react-icons/lu";
import "./delete-dialog.css";

interface Props { name: string; subCategories: number; busy: boolean; onConfirm: () => void; onClose: () => void }

/** "Are you sure?" before a category is permanently deleted. Cancel has the initial focus, so Enter never deletes by accident. */
export default function DeleteCategoryDialog({ name, subCategories, busy, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (!el.open) el.showModal(); // native modal: traps focus and returns it afterwards
    cancel.current?.focus();
    return () => el.close();
  }, []);
  return (
    <dialog ref={ref} className="cdel" aria-labelledby="cdel-title" aria-describedby="cdel-text"
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="cdel-card">
        <button type="button" className="cdel-x" aria-label="Close" disabled={busy} onClick={onClose}><LuX size={18} aria-hidden="true" /></button>
        <span className="cdel-icon"><LuTrash2 size={26} aria-hidden="true" /></span>
        <h2 id="cdel-title">Delete category?</h2>
        <p id="cdel-text">You are about to permanently delete <strong>{name}</strong>{subCategories > 0 && <> and its <strong>{subCategories} sub-categor{subCategories === 1 ? "y" : "ies"}</strong></>}. This cannot be undone.</p>
        <div className="cdel-note">
          <LuEyeOff size={18} aria-hidden="true" />
          <span><b>Your products are safe.</b> Any product in {subCategories > 0 ? "these categories" : "this category"} is hidden from the store until you give it a new category.</span>
        </div>
        <div className="cdel-actions">
          <button ref={cancel} type="button" className="cdel-cancel" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="cdel-delete" disabled={busy} aria-busy={busy} onClick={onConfirm}>{busy ? <><i aria-hidden="true" />Deleting…</> : <><LuTrash2 size={16} aria-hidden="true" />Yes, delete</>}</button>
        </div>
      </div>
    </dialog>
  );
}
