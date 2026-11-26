import nodemailer, { Transporter } from "nodemailer";

/** SMTP transport (works with Brevo, SES SMTP, Gmail app-passwords, Zoho, Mailgun...). Returns null when not configured. */
let transport: Transporter | null | undefined;
export function getMailer(): { transporter: Transporter; from: string } | null {
  if (transport === undefined) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    transport = SMTP_HOST ? nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT ?? 587), secure: Number(SMTP_PORT) === 465, auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined, connectionTimeout: 10_000, socketTimeout: 15_000 }) : null;
  }
  return transport ? { transporter: transport, from: process.env.SMTP_FROM ?? "PetBlitz <no-reply@petblitz.in>" } : null;
}
export const _resetMailer = () => { transport = undefined; };
