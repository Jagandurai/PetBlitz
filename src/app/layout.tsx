import type { Metadata, Viewport } from "next";
import { Fredoka, Inter, Nunito } from "next/font/google";
import { ReactNode } from "react";
import { ToastProvider } from "@/lib/ui/hooks";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const fredoka = Fredoka({ subsets: ["latin"], weight: ["500", "600"], display: "swap", variable: "--font-fredoka" });
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-nunito" });

export const metadata: Metadata = { icons: { icon: "/logo.png", apple: "/logo.png" }, title: { default: "PetBlitz — dogs, cats & pet essentials", template: "%s · PetBlitz" }, description: "Healthy, vaccinated puppies and kittens plus quality accessories, delivered across India." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={`${inter.variable} ${fredoka.variable} ${nunito.variable}`}><body><ToastProvider>{children}</ToastProvider></body></html>;
}
