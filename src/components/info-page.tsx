"use client";
import { PAGES } from "@/lib/content/pages";
import { useApi } from "@/lib/ui/hooks";

export default function InfoPage({ slug }: { slug: keyof typeof PAGES }) {
  const page = PAGES[slug];
  const s = useApi<{ returns: { windowDays: number; petsReturnable: boolean } }>("/api/settings/public");
  const fill = (t: string) => t
    .replace("{windowDays}", String(s.data?.returns.windowDays ?? "—"))
    .replace("{petsPolicy}", s.data ? (s.data.returns.petsReturnable ? "Pets can be returned as described in the order's return options." : "Pets are not eligible for return. Please contact support if there is a problem with your pet.") : "Please contact support for pet-related returns.");
  return (
    <article className="card col info" style={{ maxWidth: 780, margin: "16px auto" }}>
      <h1>{page.title}</h1>
      <p className="muted">{page.intro}</p>
      {page.sections.map((sec) => <section key={sec.heading}><h2>{sec.heading}</h2>{sec.body.map((b) => <p key={b}>{fill(b)}</p>)}</section>)}
    </article>
  );
}
