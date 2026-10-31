import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as S from "@/services/pet.service";
import { updatePetSchema } from "@/validations/pet.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };
export const GET = admin<P>(async ({ params }) => ok(await S.getPetAdmin(idOf(params.id))));
export const PATCH = admin<P>(async ({ req, actor, params }) => ok(await S.updatePet(idOf(params.id), await parseBody(req, updatePetSchema), actor.objectId)));