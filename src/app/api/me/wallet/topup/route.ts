import { customer, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import { createWalletTopupOrder } from "@/services/payment.service";
import { topupSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Creates a Razorpay order for a wallet top-up. The wallet is credited only after the verified capture (webhook / confirm). */
export const POST = customer(async ({ req, me }) => ok(await createWalletTopupOrder(me.customerId, (await parseBody(req, topupSchema)).amount), 201), { limit: 20 });