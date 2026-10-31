import { enforceRateLimit, handle, ok } from "@/lib/http";
import { listPublicPets } from "@/services/pet.service";
import { petListQuery } from "@/validations/pet.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    await enforceRateLimit(req, "pets", 120);
    // Query values are always strings from URLSearchParams and are validated/coerced by Zod => no operator injection.
    return ok(await listPublicPets(petListQuery.parse(Object.fromEntries(new URL(req.url).searchParams))));
  });
}
