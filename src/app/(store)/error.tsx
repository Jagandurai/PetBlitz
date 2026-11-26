"use client";
import { useEffect } from "react";

export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[storefront]", error.digest ?? error.name); }, [error]);
  return (
    <div className="sf-empty"><div className="big" aria-hidden="true">🛠️</div><h3>Something went wrong on our side</h3><p>Please try again in a moment. If it keeps happening, contact support.</p><button className="sf-btn" onClick={reset}>Try again</button></div>
  );
}
