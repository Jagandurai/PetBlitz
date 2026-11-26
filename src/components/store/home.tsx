"use client";
import { BiscuitHero } from "@/components/biscuit-hero";
import { homeFonts } from "@/components/home/fonts";
import { HomeSections } from "@/components/home/sections";
import type { HomeData } from "@/components/home/types";
import "@/components/home/home.css";

export default function HomeView({ data }: { data: HomeData }) {
  return (
    <>
      <BiscuitHero />
      <div className={`hp ${homeFonts}`}><HomeSections data={data} /></div>
    </>
  );
}
