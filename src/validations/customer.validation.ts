import { z } from "zod";

export const googleProfileSchema = z.object({
  sub: z.string().min(1).max(100),
  email: z.string().email().max(254),
  email_verified: z.boolean(),
  name: z.string().max(160).optional(),
  given_name: z.string().max(80).optional(),
  family_name: z.string().max(80).optional(),
  picture: z.string().url().max(2048).optional(),
});

/** What a CUSTOMER may edit about themselves. `.strict()` rejects status/role/googleId/email etc. (no privilege escalation). */
export const customerSelfUpdateSchema = z
  .object({
    firstName: z.string().trim().max(80),
    lastName: z.string().trim().max(80),
    displayName: z.string().trim().max(160),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/),
    preferences: z.object({ newsletter: z.boolean(), preferredPetType: z.enum(["dog", "cat", "both"]) }).partial(),
    marketingConsent: z.boolean(),
  })
  .partial()
  .strict();

export const addressSchema = z
  .object({
    label: z.string().max(40).default("Home"),
    recipientName: z.string().trim().min(1).max(120),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/),
    line1: z.string().trim().min(1).max(200),
    line2: z.string().max(200).optional(),
    landmark: z.string().max(120).optional(),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().min(1).max(80),
    postalCode: z.string().trim().min(3).max(12),
    countryCode: z.string().length(2).toUpperCase().default("IN"),
  })
  .strict();

export type GoogleProfile = z.input<typeof googleProfileSchema>;
export type AddressInput = z.input<typeof addressSchema>;
export type CustomerSelfUpdate = z.input<typeof customerSelfUpdateSchema>;
