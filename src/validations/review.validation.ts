import { z } from "zod";
import { imageInput, objectId, pagination } from "./common";

/** No `verifiedPurchase` field accepted - the server derives it. */
export const createReviewSchema = z
  .object({
    orderId: objectId,
    orderItemId: objectId,
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(120).optional(),
    comment: z.string().trim().max(2000).optional(),
    images: z.array(imageInput).max(5).optional(),
  })
  .strict();

export const moderateReviewSchema = z
  .object({ status: z.enum(["approved", "rejected", "hidden", "pending"]), reason: z.string().max(500).optional() })
  .strict();

export const publicReviewQuery = pagination.extend({ targetType: z.enum(["pet", "product"]), targetId: objectId }).strict();

export type CreateReviewInput = z.input<typeof createReviewSchema>;
