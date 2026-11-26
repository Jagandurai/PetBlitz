import { z } from "zod";
import { clearSessionCookie } from "@/lib/auth/session";
import { customer, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { deleteMyAccount } from "@/services/privacy.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmSchema = z.object({ confirm: z.literal("DELETE MY ACCOUNT") }).strict();

/** Anonymises the account. Blocked (409) while orders, refunds, returns or a wallet balance are outstanding. */
export const POST = customer(async ({ req, me }) => {
  await parseBody(req, confirmSchema);
  const r = await deleteMyAccount(me.customerId);
  const res = ok(r);
  res.headers.append("Set-Cookie", clearSessionCookie());
  return res;
}, { limit: 5 });
