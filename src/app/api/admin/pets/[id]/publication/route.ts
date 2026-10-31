import { admin, idOf, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as S from "@/services/pet.service";
import { publicationSchema } from "@/validations/admin.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** status: published | draft (unpublish) | archived. Publishing re-validates description, price and media. */
export const PATCH = admin<{ id: string }>(async ({ req, params }) => ok(await S.setPetPublication(idOf(params.id), (await parseBody(req, publicationSchema)).status)));