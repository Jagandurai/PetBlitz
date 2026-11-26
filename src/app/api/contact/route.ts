import { z } from "zod";
import { enforceRateLimit, ok } from "@/lib/http";
import { customer, parseBody } from "@/lib/route";
import { createContactTicket } from "@/services/message.service";
import { contactSchema } from "@/validations/message.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contact form: signed-in customers only (401 otherwise, with the cookie CSRF check), strict per-IP rate limit, 100 KB body cap,
 * honeypot (bots get a fake success and nothing is stored). The sender's identity comes from the session, never from the body.
 */
export const POST = customer(async ({ req, me }) => {
  await enforceRateLimit(req, "contact", 5, 10 * 60_000);
  const raw = await parseBody(req, z.record(z.string(), z.unknown()));
  if (typeof raw.website === "string" && raw.website !== "") return ok({ received: true }, 202);
  return ok(await createContactTicket(me.customerId, contactSchema.parse(raw)), 201);
});
