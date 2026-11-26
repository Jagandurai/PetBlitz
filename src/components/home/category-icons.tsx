import { ReactNode } from "react";
import type { HomeCategory } from "./types";

const SAGE = "#B8CDB5", CREAM = "#FFFDF7", BEIGE = "#E6D3B8", TERRA = "#B87556";

/** One drawing language for all five: 64px grid, forest-green rounded outline, flat brand fills. */
const ART: Record<HomeCategory["key"], ReactNode> = {
  // grooming brush
  grooming: <>
    <path d="M17 33v10M24 33v13M31 33v13M38 33v13M45 33v10" fill="none" />
    <rect x="10" y="20" width="42" height="13" rx="6.5" fill={TERRA} />
    <path d="M22 20c0-8 18-8 18 0" fill={BEIGE} />
    <path d="M51 8v8M47 12h8" fill="none" />
  </>,
  // ball and rope toy
  toys: <>
    <circle cx="26" cy="28" r="17" fill={SAGE} />
    <path d="M12 19c10 2 17 10 18 26M22 12c3 9 11 15 21 16" fill="none" />
    <path d="M34 52l14-10" fill="none" strokeWidth="5" stroke={TERRA} />
    <circle cx="33" cy="52" r="5" fill={BEIGE} />
    <circle cx="50" cy="41" r="5" fill={BEIGE} />
  </>,
  // litter tray with scoop
  litter: <>
    <path d="M7 34h38l-4 18H11z" fill={SAGE} />
    <rect x="5" y="29" width="42" height="7" rx="3.5" fill={CREAM} />
    <path d="M15 29c3-6 8-6 11-1 3-4 8-3 10 1" fill={BEIGE} />
    <path d="M52 8l-6 16" fill="none" strokeWidth="4" />
    <path d="M38 22l16 6-5 10c-6 1-12-1-14-6z" fill={TERRA} />
  </>,
  // shampoo bottle with bubbles
  hygiene: <>
    <rect x="16" y="26" width="24" height="30" rx="8" fill={SAGE} />
    <rect x="22" y="18" width="12" height="8" rx="2" fill={BEIGE} />
    <path d="M28 18v-7h-9" fill="none" />
    <rect x="21" y="35" width="14" height="12" rx="4" fill={CREAM} />
    <circle cx="49" cy="20" r="7" fill={CREAM} />
    <circle cx="48" cy="38" r="4.5" fill={CREAM} />
    <circle cx="53" cy="50" r="3" fill={TERRA} />
  </>,
  // pet T-shirt
  clothing: <>
    <path d="M22 11L7 21l6 12 6-3v23h26V30l6 3 6-12-15-10c-2 9-18 9-20 0z" fill={TERRA} />
    <path d="M19 45h26" fill="none" />
    <g fill={CREAM} stroke="none">
      <ellipse cx="32" cy="37" rx="5.5" ry="4.5" />
      <circle cx="24.5" cy="32" r="2.3" />
      <circle cx="29.5" cy="28.5" r="2.3" />
      <circle cx="35" cy="28.5" r="2.3" />
      <circle cx="39.5" cy="32" r="2.3" />
    </g>
  </>,
};

export const CategoryIcon = ({ name }: { name: HomeCategory["key"] }) => (
  <svg viewBox="0 0 64 64" stroke="#263D2B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ART[name]}</svg>
);
