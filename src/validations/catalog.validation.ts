import { z } from "zod";
import { categoryList } from "./common";

export const facetsQuery = z.object({ kind: z.literal("products"), category: categoryList.optional() }).strict();
