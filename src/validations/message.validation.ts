import { z } from "zod";
import { objectId } from "./common";

const attachment = z.object({
  name: z.string().max(200),
  storageKey: z.string().min(1).max(512),
  url: z.string().url().max(2048).optional(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024),
});

const category = z.enum(["general", "payment", "delivery", "return", "refund", "product", "pet", "other"]);

export const publicContactSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().email().max(254),
    phone: z.string().max(20).optional(),
    subject: z.string().trim().min(3).max(200),
    body: z.string().trim().min(10).max(5000),
    category: category.default("general"),
    orderNumber: z.string().max(30).optional(),
    website: z.string().max(0).optional(), // honeypot: real users leave it empty
  })
  .strict();

export const customerTicketSchema = z
  .object({
    subject: z.string().trim().min(3).max(200),
    body: z.string().trim().min(1).max(5000),
    category: category.default("general"),
    orderId: objectId.optional(),
    attachments: z.array(attachment).max(5).optional(),
  })
  .strict();

export const replySchema = z.object({ body: z.string().trim().min(1).max(5000), attachments: z.array(attachment).max(5).optional() }).strict();

export type PublicContactInput = z.input<typeof publicContactSchema>;
export type CustomerTicketInput = z.input<typeof customerTicketSchema>;
export type ReplyInput = z.input<typeof replySchema>;
