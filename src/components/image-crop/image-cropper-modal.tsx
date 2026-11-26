"use client";
import { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { LuMinus, LuPlus, LuRotateCcw, LuRotateCw, LuX } from "react-icons/lu";
import { errText } from "@/lib/ui/api";
import { Area, CROP_PRESETS, PresetKey, coverRegion, outputSize, resolutionWarning } from "@/lib/ui/image-presets";
import "./cropper.css";

export interface CropView { crop: { x: number; y: number }; zoom: number; rotation: number }
export interface OverlayText { heading?: string; paragraph?: string }
const START: CropView = { crop: { x: 0, y: 0 }, zoom: 1, rotation: 0 };
const MAX_ZOOM = 4;

/** Draws `area` of the rotated picture (the cropper's coordinate space) so that it fills the canvas. */
function draw(canvas: HTMLCanvasElement, img: HTMLImageElement, rotation: number, area: Area, width: number, height: number) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process images");
  const w = img.naturalWidth, h = img.naturalHeight, sideways = rotation % 180 !== 0;
  ctx.imageSmoothingQuality = "high";
  ctx.scale(width / area.width, height / area.height);
  ctx.translate((sideways ? h : w) / 2 - area.x, (sideways ? w : h) / 2 - area.y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2);
}

function Preview({ img, area, rotation, aspect, label, overlay }: { img: HTMLImageElement; area: Area; rotation: number; aspect: number; label: string; overlay?: OverlayText }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const w = 360;
    draw(ref.current, img, rotation, coverRegion(area, aspect), w, Math.round(w / aspect));
  }, [img, area, rotation, aspect]);
  return (
    <figure className="crp-preview">
      <div style={{ aspectRatio: aspect, maxWidth: aspect < 1 ? `${Math.round(190 * aspect)}px` : undefined }}>
        <canvas ref={ref} role="img" aria-label={`${label} preview`} />
        {(overlay?.heading || overlay?.paragraph) && <span className="crp-text"><b>{overlay.heading}</b><small>{overlay.paragraph}</small></span>}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

interface Props {
  /** A newly chosen file, or the address of a saved Cloudinary image. */
  source: File | string;
  preset: PresetKey;
  initial?: CropView;
  overlay?: OverlayText;
  /** Uploads the finished file. The window stays open (and shows the error) if this rejects. */
  onApply: (file: File, view: CropView, onProgress: (percent: number) => void) => Promise<void>;
  onClose: () => void;
}

export default function ImageCropperModal({ source, preset, initial, overlay, onApply, onClose }: Props) {
  const p = CROP_PRESETS[preset];
  const dialog = useRef<HTMLDialogElement>(null);
  const [src, setSrc] = useState(""), [img, setImg] = useState<HTMLImageElement | null>(null);
  const [view, setView] = useState<CropView>(initial ?? START), [area, setArea] = useState<Area | null>(null);
  const [progress, setProgress] = useState<number | null>(null), [error, setError] = useState("");
  const remote = typeof source === "string";
  const uploading = progress !== null;

  useEffect(() => {
    const el = dialog.current!;
    if (!el.open) el.showModal(); // native modal: traps focus and returns it afterwards
    return () => el.close();
  }, []);

  useEffect(() => {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    const picture = new Image();
    if (typeof source === "string") picture.crossOrigin = "anonymous";
    picture.onload = () => { setImg(picture); setSrc(url); };
    picture.onerror = () => setError("The picture could not be opened");
    picture.src = url;
    return () => { picture.onload = picture.onerror = null; if (typeof source !== "string") URL.revokeObjectURL(url); };
  }, [source]);

  const zoomTo = (zoom: number) => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, Math.max(1, zoom)) }));
  const turn = (by: number) => setView((v) => ({ crop: { x: 0, y: 0 }, zoom: v.zoom, rotation: (v.rotation + by + 360) % 360 }));

  const apply = async () => {
    if (!img || !area) return;
    setError(""); setProgress(0);
    const canvas = document.createElement("canvas");
    try {
      const size = outputSize(area, p);
      draw(canvas, img, view.rotation, area, size.width, size.height);
      const jpeg = !remote && source.type === "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, jpeg ? "image/jpeg" : "image/webp", 0.92));
      if (!blob) throw new Error("The cropped picture could not be created");
      // a browser that cannot write WebP returns PNG, which is also accepted
      const ext = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1]!;
      await onApply(new File([blob], `cropped.${ext}`, { type: blob.type }), view, setProgress);
    } catch (e) { setError(errText(e)); setProgress(null); }
    finally { canvas.width = canvas.height = 0; }
  };

  const warning = area ? resolutionWarning(area, p) : "";

  return (
    <dialog ref={dialog} className="crp" aria-labelledby="crp-title" onCancel={(e) => { e.preventDefault(); if (!uploading) onClose(); }}>
      <header>
        <div>
          <h2 id="crp-title">Adjust Image</h2>
          <p>Recommended size {p.output.width} × {p.output.height}{img && <> · {remote ? "Saved" : "Original"} image {img.naturalWidth} × {img.naturalHeight}</>}</p>
        </div>
        <button type="button" className="btn sm ghost" aria-label="Close" disabled={uploading} onClick={onClose}><LuX aria-hidden="true" /></button>
      </header>
      <div className="crp-body">
        <div className="crp-main">
          <div className="crp-stage">
            {src ? (
              <Cropper image={src} aspect={p.aspect} crop={view.crop} zoom={view.zoom} rotation={view.rotation} minZoom={1} maxZoom={MAX_ZOOM} showGrid restrictPosition objectFit="contain"
                mediaProps={{ alt: "Picture being cropped", ...(remote ? { crossOrigin: "anonymous" as const } : {}) }} cropperProps={{ "aria-label": "Crop area. Use the arrow keys to move the picture." }}
                onCropChange={(crop) => !uploading && setView((v) => ({ ...v, crop }))} onZoomChange={(z) => !uploading && zoomTo(z)} onCropAreaChange={(_, pixels) => setArea(pixels)} onCropComplete={(_, pixels) => setArea(pixels)} />
            ) : !error && <span className="crp-wait">Opening picture…</span>}
          </div>
          <div className="crp-controls">
            <button type="button" className="btn sm ghost" aria-label="Zoom out" disabled={!img || uploading || view.zoom <= 1} onClick={() => zoomTo(view.zoom - 0.1)}><LuMinus aria-hidden="true" /></button>
            <input type="range" aria-label="Zoom" min={1} max={MAX_ZOOM} step={0.01} value={view.zoom} disabled={!img || uploading} onChange={(e) => zoomTo(Number(e.target.value))} />
            <button type="button" className="btn sm ghost" aria-label="Zoom in" disabled={!img || uploading || view.zoom >= MAX_ZOOM} onClick={() => zoomTo(view.zoom + 0.1)}><LuPlus aria-hidden="true" /></button>
            <button type="button" className="btn sm ghost" aria-label="Rotate left" disabled={!img || uploading} onClick={() => turn(-90)}><LuRotateCcw aria-hidden="true" /></button>
            <button type="button" className="btn sm ghost" aria-label="Rotate right" disabled={!img || uploading} onClick={() => turn(90)}><LuRotateCw aria-hidden="true" /></button>
            <button type="button" className="btn sm ghost" disabled={!img || uploading} onClick={() => setView(START)}>Reset</button>
          </div>
        </div>
        <aside className="crp-previews" aria-label="How it will look">
          {img && area && p.previews.map((x) => <Preview key={x.label} img={img} area={area} rotation={view.rotation} aspect={x.aspect} label={x.label} overlay={overlay} />)}
          {p.previews.length > 1 && <p className="muted small">{p.usage === "banner" ? "Phones" : "Listing cards"} trim the edges evenly, so keep the important part near the centre.</p>}
        </aside>
      </div>
      {warning && <div className="alert warn" role="status">{warning}</div>}
      {error && <div className="alert err" role="alert">{error}</div>}
      {uploading && <div className="crp-progress" role="progressbar" aria-label="Upload progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /><span>Uploading {progress}%</span></div>}
      <footer>
        <button type="button" className="btn ghost" disabled={uploading} onClick={onClose}>Cancel</button>
        <button type="button" className="btn" disabled={!img || !area || uploading} onClick={apply}>{uploading ? "Uploading…" : "Apply Crop"}</button>
      </footer>
    </dialog>
  );
}
