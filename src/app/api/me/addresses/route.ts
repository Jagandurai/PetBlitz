import { customer, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as Cu from "@/services/customer.service";
import { addressSchema } from "@/validations/customer.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = customer(async ({ me }) => ok({ addresses: (await Cu.getOwnProfile(me.customerId)).addresses }));
export const POST = customer(async ({ req, me }) => ok({ addressId: await Cu.addAddress(me.customerId, await parseBody(req, addressSchema)) }, 201));