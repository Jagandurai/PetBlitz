import { customer, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as Cu from "@/services/customer.service";
import { customerSelfUpdateSchema } from "@/validations/customer.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = customer(async ({ me }) => ok(await Cu.getOwnProfile(me.customerId)));
export const PATCH = customer(async ({ req, me }) => ok(await Cu.updateOwnProfile(me.customerId, await parseBody(req, customerSelfUpdateSchema))));