import { admin, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { createCloudinaryUploadSignature } from "@/lib/storage";
import { mediaSignSchema } from "@/validations/admin.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns a short-lived Cloudinary upload signature (never the API secret). 503 MEDIA_NOT_CONFIGURED until CLOUDINARY_* is set. */
export const POST = admin(async ({ req }) => ok(createCloudinaryUploadSignature((await parseBody(req, mediaSignSchema)).folder)));
