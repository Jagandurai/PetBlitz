import { DM_Sans, Playfair_Display } from "next/font/google";

/** Homepage and banner fonts (self-hosted by next/font). Separate from the hero so the hero stays untouched. */
const serif = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"], display: "swap", variable: "--hp-serif" });
const sans = DM_Sans({ subsets: ["latin"], style: ["normal", "italic"], display: "swap", variable: "--hp-sans" });
export const homeFonts = `${serif.variable} ${sans.variable}`;
