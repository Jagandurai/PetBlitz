import type { Metadata } from "next";
import HomeView from "@/components/store/home";
import { getPublicHomeData } from "@/services/homepage.service";

// rendered per request so banner and product changes appear without a redeploy
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: { absolute: "PetBlitz — quality pet essentials" }, description: "Shop quality food, toys and pet accessories. Secure payments, tracked delivery and instant wallet refunds." };
export default async function Page() { return <HomeView data={await getPublicHomeData()} />; }
