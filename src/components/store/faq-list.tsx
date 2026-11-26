"use client";
import { PointerEvent, ReactNode, useEffect, useId, useRef, useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import "./faq-list.css";

const OPEN_DELAY = 120; // ignores a cursor that is only passing over
const CLOSE_DELAY = 250;

/**
 * FAQ boxes that reveal on mouse hover and close when the mouse leaves the list.
 * A click or tap keeps one open (and closes it again), so touch and keyboard users get the same content.
 */
export function FaqList({ items }: { items: { q: string; a: ReactNode }[] }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wanted = useRef<number | null>(null);

  const cancel = () => { clearTimeout(timer.current); wanted.current = null; };
  useEffect(() => () => clearTimeout(timer.current), []);

  // Reacts to real cursor movement only: boxes sliding under a still cursor must not start a chain of openings.
  const move = (e: PointerEvent, i: number) => {
    if (e.pointerType !== "mouse" || hover === i || wanted.current === i) return;
    cancel();
    wanted.current = i;
    timer.current = setTimeout(() => { wanted.current = null; setHover(i); }, OPEN_DELAY);
  };
  const leave = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    cancel();
    timer.current = setTimeout(() => setHover(null), CLOSE_DELAY);
  };
  const toggle = (i: number) => {
    cancel();
    setHover(null);
    setPinned(pinned === i ? null : i);
  };
  // While another box is hovered, the pinned one stays open too.
  const isOpen = (i: number) => hover === i || pinned === i;

  return (
    <div className="faq" onPointerLeave={leave}>
      {items.map((f, i) => (
        <div key={f.q} className={`faq-item${isOpen(i) ? " is-open" : ""}`} onPointerMove={(e) => move(e, i)}>
          <h3>
            <button type="button" id={`${id}-q${i}`} aria-expanded={isOpen(i)} aria-controls={`${id}-a${i}`} onClick={() => toggle(i)}>
              <span>{f.q}</span>
              <i aria-hidden="true"><LuChevronDown /></i>
            </button>
          </h3>
          <div className="faq-panel" id={`${id}-a${i}`} role="region" aria-labelledby={`${id}-q${i}`}>
            <div><div className="faq-answer">{f.a}</div></div>
          </div>
        </div>
      ))}
    </div>
  );
}
