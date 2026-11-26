"use client";
import { useEffect, useState } from "react";
import ImageUploadField from "@/components/image-crop/image-upload-field";
import { Button, ErrorBox, Spinner, TextArea, TextField } from "@/components/ui";
import { api, errText } from "@/lib/ui/api";
import { useAdmin } from "@/lib/ui/admin";
import { useApi, useToast } from "@/lib/ui/hooks";
import { BANNER_PRESETS } from "@/lib/ui/image-presets";
import type { BannerSlot } from "@/services/banner.service";
import { BANNER_LIMITS } from "@/validations/homepage.validation";
import "./banners.css";

const POSITIONS = ["Banner 1 – Large Left", "Banner 2 – Upper Middle", "Banner 3 – Upper Right", "Banner 4 – Bottom Wide"];

function BannerEditor({ initial, canEdit }: { initial: BannerSlot; canEdit: boolean }) {
  const label = POSITIONS[initial.slot - 1]!;
  const { toast } = useToast();
  const [saved, setSaved] = useState(initial), [b, setB] = useState(initial);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const dirty = (["heading", "paragraph", "imageUrl"] as const).some((k) => b[k] !== saved[k]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    setBusy(true); setError("");
    try {
      const next = await api<BannerSlot>(`/api/admin/banners/${b.slot}`, { method: "PUT", body: { heading: b.heading, paragraph: b.paragraph, imageUrl: b.imageUrl, imageKey: b.imageKey } });
      setSaved(next); setB(next);
      toast(`${label} saved. It is live now.`, "ok");
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  return (
    <section className="set-card bnr" aria-label={label}>
      <h2>{label}</h2>
      <ImageUploadField label={label} preset={BANNER_PRESETS[b.slot - 1]!} folder="banners" value={b.imageUrl || undefined} overlay={{ heading: b.heading, paragraph: b.paragraph }} disabled={!canEdit || busy}
        onChange={(up) => { setB((x) => ({ ...x, imageUrl: up.url, imageKey: up.storageKey })); toast("Image uploaded. Press Save to show it on the website.", "ok"); }} />
      <TextField label="Heading" hint="Optional" value={b.heading} maxLength={BANNER_LIMITS.heading} disabled={!canEdit} onChange={(heading) => setB((x) => ({ ...x, heading }))} />
      <TextArea label="Paragraph" hint="Optional" value={b.paragraph} maxLength={BANNER_LIMITS.paragraph} rows={3} onChange={(paragraph) => canEdit && setB((x) => ({ ...x, paragraph }))} />
      {error && <div className="alert err" role="alert">{error}</div>}
      {canEdit && <div className="row"><Button busy={busy} disabled={!dirty} onClick={save}>Save</Button><span className="muted small" role="status">{dirty ? "Unsaved changes" : "Saved"}</span></div>}
    </section>
  );
}

export default function BannersPage() {
  const { can } = useAdmin();
  const { data, error, reload } = useApi<BannerSlot[]>("/api/admin/banners");
  if (error) return <ErrorBox msg={error} retry={reload} />;
  if (!data) return <Spinner />;
  return (
    <>
      <div className="top"><h1>Promotional Banners</h1></div>
      <p className="muted mb">The four banners on the home page. Heading and paragraph are optional: leave both empty to show only the image.</p>
      <div className="bnr-grid">{data.map((b) => <BannerEditor key={b.slot} initial={b} canEdit={can("marketing.write")} />)}</div>
    </>
  );
}
