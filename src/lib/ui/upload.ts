import { api } from "./api";

/** Admin image upload to Cloudinary using a short-lived server signature (the API secret never reaches the browser). */
export async function uploadImage(file: File, folder: "products" | "categories" | "reviews" | "blog" | "banners", onProgress?: (percent: number) => void): Promise<{ url: string; storageKey: string }> {
  const s = await api<{ uploadUrl: string; fields: Record<string, string | number> }>("/api/admin/media/sign", { method: "POST", body: { folder } });
  const fd = new FormData();
  Object.entries(s.fields).forEach(([k, v]) => fd.append(k, String(v)));
  fd.append("file", file);
  const j = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", s.uploadUrl);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    x.onerror = () => reject(new Error("Upload failed: check your connection and try again"));
    x.onload = () => {
      let body: { secure_url?: string; public_id?: string; error?: { message?: string } } = {};
      try { body = JSON.parse(x.responseText); } catch { /* handled below */ }
      if (x.status >= 200 && x.status < 300 && body.secure_url) resolve(body as { secure_url: string; public_id: string });
      else reject(new Error(body.error?.message ?? "Upload failed"));
    };
    x.send(fd);
  });
  return { url: j.secure_url, storageKey: j.public_id };
}
