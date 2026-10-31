import { Types } from "mongoose";
import { AppError } from "./errors";

export function toObjectId(v: string | Types.ObjectId, label = "id"): Types.ObjectId {
  if (v instanceof Types.ObjectId) return v;
  if (typeof v === "string" && /^[a-f\d]{24}$/i.test(v)) return new Types.ObjectId(v);
  throw new AppError("INVALID_ID", 400, `Invalid ${label}`);
}
export const sameId = (a: unknown, b: unknown) => String(a) === String(b);
