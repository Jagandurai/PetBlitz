"use client";
import { FaPaw } from "react-icons/fa6";
import { homeFonts } from "@/components/home/fonts";
import { PageHelp, PageHero, PageTabs } from "@/components/page-parts";
import { PAGES } from "@/lib/content/pages";
import { useApi } from "@/lib/ui/hooks";

export default function InfoPage({ slug }: { slug: keyof typeof PAGES & string }) {
  const page = PAGES[slug];
  const s = useApi<{ returns: { windowDays: number } }>("/api/settings/public");
  const fill = (t: string) => t.replace("{windowDays}", String(s.data?.returns.windowDays ?? "—"));
  return (
    <article className={`pg ${homeFonts}`}>
      <PageHero eyebrow="PetBlitz help centre" title={page.title} intro={page.intro} />
      <PageTabs current={slug} />
      <ol className="pg-sections">
        {page.sections.map((sec, i) => (
          <li key={sec.heading}>
            <FaPaw className="pg-mark" aria-hidden="true" />
            <span className="pg-num" aria-hidden="true">{i + 1}</span>
            <h2>{sec.heading}</h2>
            {sec.body.map((b) => <p key={b}>{fill(b)}</p>)}
          </li>
        ))}
      </ol>
      <PageHelp />
    </article>
  );
}
