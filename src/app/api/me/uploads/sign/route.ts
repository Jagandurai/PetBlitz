import { customer } from "@/lib/route";
import { ok } from "@/lib/http";
import { createCloudinaryUploadSignature } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed Cloudinary upload for review photos (folder fixed to "reviews"; 10 / minute). 503 until Cloudinary is configured. */
export const POST = customer(async () => ok(createCloudinaryUploadSignature("reviews")), { limit: 10 });
