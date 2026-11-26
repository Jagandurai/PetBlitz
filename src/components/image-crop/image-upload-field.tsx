"use client";
/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { LuCrop, LuImagePlus } from "react-icons/lu";
import { errText } from "@/lib/ui/api";
import { cdn } from "@/lib/ui/cdn";
import { CROP_PRESETS, PresetKey } from "@/lib/ui/image-presets";
import { uploadImage } from "@/lib/ui/upload";
import type { CropView, OverlayText } from "./image-cropper-modal";
import "./cropper.css";

// the cropper and its library are downloaded only when an administrator opens it
const ImageCropperModal = dynamic(() => import("./image-cropper-modal"), { ssr: false });

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 8, MIN_SIDE = 300;

/** Throws a readable message for anything that should not be cropped or uploaded. */
async function validate(file: File) {
  if (!TYPES.includes(file.type)) throw new Error("Use a JPG, PNG or WebP image");
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`The image is larger than ${MAX_MB} MB`);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => { throw new Error("That file is damaged or is not an image"); });
    if (img.naturalWidth < MIN_SIDE || img.naturalHeight < MIN_SIDE) throw new Error(`The image is ${img.naturalWidth} × ${img.naturalHeight}. Each side must be at least ${MIN_SIDE} pixels.`);
  } finally { URL.revokeObjectURL(url); }
}

interface Props {
  /** Names the field for screen readers and the preview. */
  label: string;
  preset: PresetKey;
  folder: "banners" | "blog";
  value?: string;
  onChange: (image: { url: string; storageKey: string }) => void;
  overlay?: OverlayText;
  disabled?: boolean;
}

/** Drop or choose an image, crop it to the storefront shape, then upload it. The form's own Save button publishes it. */
export default function ImageUploadField({ label, preset, folder, value, onChange, overlay, disabled }: Props) {
  const { output, aspect } = CROP_PRESETS[preset];
  const input = useRef<HTMLInputElement>(null);
  const [cropping, setCropping] = useState<{ source: File | string; view?: CropView } | null>(null);
  /** The untouched original of the last upload, so the crop can be changed without losing quality. */
  const [last, setLast] = useState<{ file: File; view: CropView; url: string } | null>(null);
  const [error, setError] = useState(""), [over, setOver] = useState(false);
  const original = last && last.url === value ? last : null;
  const adjustable = !!original || !!value?.startsWith("https://res.cloudinary.com/");

  const choose = async (file?: File) => {
    if (input.current) input.current.value = "";
    if (!file || disabled) return;
    setError("");
    try { await validate(file); setCropping({ source: file }); } catch (e) { setError(errText(e)); }
  };

  return (
    <div className="crp-field">
      <div className={`crp-drop${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); void choose(e.dataTransfer.files?.[0]); }}>
        {value
          ? <div className="crp-current" style={{ aspectRatio: aspect, maxWidth: Math.round(240 * aspect) }}><img src={cdn(value, 720)} alt={`${label}: current image`} /></div>
          : <span className="crp-empty"><LuImagePlus size={26} aria-hidden="true" />{disabled ? "No image yet" : "Drag an image here"}</span>}
        {!disabled && (
          <div className="crp-actions">
            <button type="button" className="btn sm" onClick={() => input.current?.click()}><LuImagePlus aria-hidden="true" /> {value ? "Replace image" : "Upload image"}</button>
            {adjustable && <button type="button" className="btn sm ghost" onClick={() => setCropping(original ? { source: original.file, view: original.view } : { source: value! })}><LuCrop aria-hidden="true" /> Adjust crop</button>}
          </div>
        )}
      </div>
      <span className="muted small">JPG, PNG or WebP up to {MAX_MB} MB · recommended {output.width} × {output.height} or larger</span>
      {adjustable && !original && !disabled && <span className="muted small">Adjust crop trims the saved picture. To bring back parts cut off earlier, upload the original again.</span>}
      <input ref={input} type="file" accept={TYPES.join(",")} hidden aria-label={`${label} file`} onChange={(e) => void choose(e.target.files?.[0])} />
      {error && <div className="alert err" role="alert">{error}</div>}
      {cropping && (
        <ImageCropperModal source={cropping.source} initial={cropping.view} preset={preset} overlay={overlay} onClose={() => setCropping(null)}
          onApply={async (file, view, onProgress) => {
            const up = await uploadImage(file, folder, onProgress); // the current image stays until this succeeds
            setLast(typeof cropping.source === "string" ? null : { file: cropping.source, view, url: up.url });
            onChange(up);
            setCropping(null);
          }} />
      )}
    </div>
  );
}
