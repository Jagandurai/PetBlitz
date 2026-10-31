import { admin, parseBody, queryOf } from "@/lib/route";
import { ok } from "@/lib/http";
import * as S from "@/services/pet.service";
import { createPetSchema } from "@/validations/pet.validation";
import { adminPetQuery } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = admin(async ({ req }) => ok(await S.listPetsAdmin(adminPetQuery.parse(queryOf(req)))));
export const POST = admin(async ({ req, actor }) => ok(await S.createPet(await parseBody(req, createPetSchema), actor.objectId), 201));