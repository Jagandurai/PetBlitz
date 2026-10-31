import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, handle, ok } from "@/lib/http";
import { parseBody } from "@/lib/route";
import { createPublicTicket } from "@/services/message.service";
import { publicContactSchema } from "@/validations/message.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public contact form: strict per-IP rate limit, 100 KB body cap, honeypot (bots get a fake success and nothing is stored). */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    await enforceRateLimit(req, "contact", 5, 10 * 60_000);
    const raw = await parseBody(req, z.record(z.string(), z.unknown()));
    if (typeof raw.website === "string" && raw.website !== "") return ok({ received: true }, 202);
    return ok(await createPublicTicket(publicContactSchema.parse(raw)), 201);
  });
}
