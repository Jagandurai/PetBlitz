import { Types } from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { isDuplicateKeyError } from "@/lib/errors";
import { TEMPLATES } from "@/lib/email-templates";
import { getMailer } from "@/lib/mailer";
import { Customer } from "@/models/Customer";
import { EmailOutbox } from "@/models/Ops";

const appUrl = () => process.env.APP_ORIGIN ?? "http://localhost:3000";

/** Enqueue a transactional mail. NEVER throws and never blocks the caller; `dedupeKey` guarantees at most one mail per event. */
export async function queueEmail(o: { to?: string | null; template: keyof typeof TEMPLATES; data: Record<string, unknown>; dedupeKey: string }): Promise<void> {
  try {
    if (!o.to) return;
    await connectDB();
    const mail = TEMPLATES[o.template]!(o.data, appUrl());
    await EmailOutbox.create({ dedupeKey: o.dedupeKey, to: o.to.toLowerCase(), template: o.template, ...mail });
  } catch (e) {
    if (!isDuplicateKeyError(e)) console.error("[email] enqueue failed", o.template, e instanceof Error ? e.name : "error");
  }
}

export async function notifyCustomer(customerId: Types.ObjectId | string, template: keyof typeof TEMPLATES, data: Record<string, unknown>, dedupeKey: string) {
  try {
    await connectDB();
    const c = await Customer.findById(customerId, { email: 1, displayName: 1, firstName: 1, status: 1 }).lean();
    if (!c || c.status === "deleted") return;
    await queueEmail({ to: c.email, template, data: { name: c.firstName ?? c.displayName, ...data }, dedupeKey });
  } catch (e) { console.error("[email] notify failed", e instanceof Error ? e.name : "error"); }
}

const backoffMin = (attempt: number) => Math.min(2 ** attempt, 120);

/** Sends due mails (called by the maintenance job). A crashed worker's 'sending' rows are re-claimed after 5 minutes. */
export async function processOutbox(limit = 20): Promise<{ sent: number; failed: number; skipped: boolean }> {
  const mailer = getMailer();
  if (!mailer) return { sent: 0, failed: 0, skipped: true }; // SMTP not configured: mails stay queued
  await connectDB();
  let sent = 0, failed = 0;
  for (let i = 0; i < limit; i++) {
    const now = new Date();
    const m = await EmailOutbox.findOneAndUpdate(
      { $or: [{ status: "pending", nextAttemptAt: { $lte: now } }, { status: "sending", updatedAt: { $lte: new Date(now.getTime() - 5 * 60_000) } }] },
      { $set: { status: "sending" }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1 }, new: true },
    ).lean();
    if (!m) break;
    try {
      await mailer.transporter.sendMail({ from: mailer.from, to: m.to, subject: m.subject, html: m.html, text: m.text });
      await EmailOutbox.updateOne({ _id: m._id }, { $set: { status: "sent", sentAt: new Date() }, $unset: { lastError: 1 } });
      sent++;
    } catch (e) {
      const final = m.attempts >= 5;
      await EmailOutbox.updateOne({ _id: m._id }, { $set: { status: final ? "failed" : "pending", nextAttemptAt: new Date(Date.now() + backoffMin(m.attempts) * 60_000), lastError: (e instanceof Error ? e.message : "send failed").slice(0, 300) } });
      failed++;
    }
  }
  return { sent, failed, skipped: false };
}
