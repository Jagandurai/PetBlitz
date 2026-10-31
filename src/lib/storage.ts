import { createHash } from "node:crypto";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

export const MEDIA_FOLDERS = ["pets", "products", "categories", "reviews"] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];
export const ALLOWED_FORMATS = "jpg,jpeg,png,webp";

/**
 * Provider integration point: Cloudinary SIGNED uploads. The browser uploads straight to Cloudinary using a short-lived
 * signature we generate here; the API secret never leaves the server and no binary ever touches MongoDB or this app.
 * After upload the admin stores the returned `secure_url` + `public_id` (as url/storageKey) on the pet/product/category.
 * Signature = SHA-1("allowed_formats=...&folder=...&timestamp=..." + API_SECRET)  (params sorted alphabetically).
 */
export function createCloudinaryUploadSignature(folder: MediaFolder, now = Date.now()) {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: secret } = getEnv();
  if (!cloudName || !apiKey || !secret) throw new AppError("MEDIA_NOT_CONFIGURED", 503, "Media uploads are not configured");
  const timestamp = Math.floor(now / 1000);
  const fullFolder = `petblitz/${folder}`;
  const toSign = `allowed_formats=${ALLOWED_FORMATS}&folder=${fullFolder}&timestamp=${timestamp}`;
  const signature = createHash("sha1").update(toSign + secret).digest("hex");
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    fields: { api_key: apiKey, timestamp, folder: fullFolder, allowed_formats: ALLOWED_FORMATS, signature },
    expiresInSeconds: 3600, // Cloudinary rejects signatures older than 1 hour
  };
}
