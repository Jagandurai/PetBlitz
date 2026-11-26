"use client";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuChevronDown } from "react-icons/lu";

interface Props { value: string; options: string[][]; onChange: (value: string) => void }

/**
 * "Sort by" dropdown. A native <select> draws its open list with the operating system's style, so this is a listbox
 * with the same keyboard behaviour: arrows, Home/End, Enter or Space to choose, Escape or Tab to close.
 */
export function SortMenu({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), list = useRef<HTMLUListElement>(null);
  const selected = Math.max(0, options.findIndex(([v]) => v === value));

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const show = () => { setActive(selected); setOpen(true); };
  const close = () => { setOpen(false); button.current?.focus(); };
  const pick = (i: number) => { close(); if (i !== selected) onChange(options[i]![0]!); };
  const keys = (e: React.KeyboardEvent) => {
    const move: Record<string, number> = { ArrowDown: Math.min(options.length - 1, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: options.length - 1 };
    if (e.key in move) { e.preventDefault(); setActive(move[e.key]!); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div className="cf-sort" ref={root}>
      <button ref={button} type="button" className="cf-sort-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`Sort by: ${options[selected]![1]}`}
        onClick={() => (open ? close() : show())} onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(); } }}>
        <span>Sort by</span><b>{options[selected]![1]}</b><LuChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <ul ref={list} className="cf-menu" role="listbox" tabIndex={-1} aria-label="Sort by" aria-activedescendant={`cf-sort-${active}`} onKeyDown={keys}>
          {options.map(([v, label], i) => (
            <li key={v} id={`cf-sort-${i}`} role="option" aria-selected={i === selected} className={i === active ? "active" : undefined} onPointerEnter={() => setActive(i)} onClick={() => pick(i)}>
              <span>{label}</span>{i === selected && <LuCheck size={16} strokeWidth={3} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
