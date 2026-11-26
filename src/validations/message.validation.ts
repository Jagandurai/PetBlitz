import { z } from "zod";
import { objectId } from "./common";

const attachment = z.object({
  name: z.string().max(200),
  storageKey: z.string().min(1).max(512),
  url: z.string().url().max(2048).optional(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024),
});

const category = z.enum(["general", "payment", "delivery", "return", "refund", "product", "other"]);

/**
 * Contact form (signed-in customers only). There is deliberately no e-mail field: the address comes from the account,
 * and anything else in the request body (including "email" or "customerId") is dropped.
 */
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(20).regex(/^(|\+?[\d\s()-]{7,19})$/, "Enter a valid phone number").optional(),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(5000),
  category: category.default("general"),
  orderNumber: z.string().max(30).optional(),
  website: z.string().max(0).optional(), // honeypot: real users leave it empty
});

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

export type ContactInput = z.input<typeof contactSchema>;
export type CustomerTicketInput = z.input<typeof customerTicketSchema>;
export type ReplyInput = z.input<typeof replySchema>;
