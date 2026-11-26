import type { ProductData } from "@/components/store/types";

export interface HomeCategory { key: "grooming" | "toys" | "litter" | "hygiene" | "clothing"; name: string; href: string }
export interface HomeBanner { slot: number; heading: string; paragraph: string; imageUrl: string }
export interface HomeData { categories: HomeCategory[]; banners: HomeBanner[]; newArrivals: ProductData[]; featured: ProductData[] }
