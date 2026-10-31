import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as S from "@/services/pet.service";
import { petAvailabilitySchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = admin<{ id: string }>(async ({ req, params }) => ok(await S.setPetAvailability(idOf(params.id), (await parseBody(req, petAvailabilitySchema)).status)));