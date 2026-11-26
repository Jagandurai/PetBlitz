import { z } from "zod";
import { objectId, pagination } from "./common";
export const createReturnSchema = z.object({ orderId: objectId, orderItemId: objectId, quantity: z.number().int().min(1).max(100), reason: z.enum(["damaged", "wrong_item", "not_as_described", "no_longer_needed", "other"]), details: z.string().trim().max(1000).optional() }).strict();

export const returnActionSchema = z.object({ action: z.enum(["approve", "reject", "receive", "close"]), note: z.string().trim().max(1000).optional() }).strict();

export const returnRefundSchema = z.object({ amount: z.number().int().min(1).optional(), destination: z.enum(["wallet", "original"]).default("wallet") }).strict();

export const returnQuery = pagination.extend({ status: z.enum(["requested", "approved", "rejected", "received", "refunded", "closed"]).optional() }).strict();

