import { admin, parseBody } from "@/lib/route";
import { ok } from "@/lib/http";
import * as S from "@/services/blog.service";
import { taxonomySchema } from "@/validations/blog.validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = admin(async ({ req }) => ok(await S.updateTaxonomy(await parseBody(req, taxonomySchema))));
