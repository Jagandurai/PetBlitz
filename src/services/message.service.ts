import { connectDB } from "@/lib/db/connection";
import { conflict, notFound } from "@/lib/errors";
import { toObjectId } from "@/lib/ids";
import { sanitizeText } from "@/lib/sanitize";
import { notifyCustomer, queueEmail } from "./email.service";
import { nextTicketNumber } from "@/lib/sequence";
import { MAX_MESSAGES_PER_TICKET, Message } from "@/models/Message";
import { Order } from "@/models/Order";
import { CustomerTicketInput, PublicContactInput, ReplyInput, customerTicketSchema, publicContactSchema, replySchema } from "@/validations/message.validation";

const THREAD_PAGE = 50;

/** Public contact form. Honeypot is enforced by the schema (`website` must be empty); IP rate limiting belongs in the route. */
export async function createPublicTicket(input: PublicContactInput) {
  await connectDB();
  const d = publicContactSchema.parse(input);
  const order = d.orderNumber ? await Order.findOne({ orderNumber: d.orderNumber }, { _id: 1 }).lean() : null; // never reveals order data
  const body = sanitizeText(d.body);
  const t = await Message.create({
    ticketNumber: await nextTicketNumber(), guest: { name: sanitizeText(d.name), email: d.email.toLowerCase(), phone: d.phone }, orderId: order?._id,
    subject: sanitizeText(d.subject), category: d.category, thread: [{ senderType: "guest", body }], messageCount: 1, lastMessageAt: new Date(),
  });
  return { ticketNumber: t.ticketNumber }; // guests receive only the ticket number
}

export async function createCustomerTicket(customerId: string, input: CustomerTicketInput) {
  await connectDB();
  const d = customerTicketSchema.parse(input);
  const cid = toObjectId(customerId);
  if (d.orderId && !(await Order.exists({ _id: toObjectId(d.orderId), customerId: cid }))) throw notFound("Order"); // can only reference own orders
  const t = await Message.create({
    ticketNumber: await nextTicketNumber(), customerId: cid, orderId: d.orderId ? toObjectId(d.orderId) : undefined, subject: sanitizeText(d.subject), category: d.category,
    thread: [{ senderType: "customer", senderId: String(cid), body: sanitizeText(d.body), attachments: d.attachments }], messageCount: 1, lastMessageAt: new Date(),
  });
  return { id: String(t._id), ticketNumber: t.ticketNumber };
}

async function appendMessage(filter: Record<string, unknown>, sender: { senderType: "customer" | "admin"; senderId?: string }, input: ReplyInput, newStatus?: string) {
  const d = replySchema.parse(input);
  const now = new Date();
  // Atomic append, guarded by messageCount so a thread can never exceed the cap.
  const t = await Message.findOneAndUpdate(
    { ...filter, status: { $ne: "closed" }, messageCount: { $lt: MAX_MESSAGES_PER_TICKET } },
    { $push: { thread: { ...sender, body: sanitizeText(d.body), attachments: d.attachments ?? [], createdAt: now } }, $inc: { messageCount: 1 }, $set: { lastMessageAt: now, ...(newStatus ? { status: newStatus } : {}) }, $unset: { resolvedAt: 1 } },
    { new: true },
  ).lean();
  if (!t) throw conflict("TICKET_UNAVAILABLE", "Ticket not found, closed, or its message limit has been reached");
  return { ticketNumber: t.ticketNumber, messageCount: t.messageCount };
}

export const addCustomerReply = (customerId: string, ticketId: string, input: ReplyInput) =>
  connectDB().then(() => appendMessage({ _id: toObjectId(ticketId), customerId: toObjectId(customerId) }, { senderType: "customer", senderId: customerId }, input, "open"));

export async function addAdminReply(ticketId: string, adminId: string, input: ReplyInput) {
  await connectDB();
  const r = await appendMessage({ _id: toObjectId(ticketId) }, { senderType: "admin", senderId: adminId }, input, "pending");
  const t = await Message.findById(toObjectId(ticketId), { customerId: 1, guest: 1, subject: 1, ticketNumber: 1 }).lean();
  const key = `ticket-reply:${ticketId}:${r.messageCount}`, data = { ticketNumber: t?.ticketNumber, ticketId, subject: t?.subject, preview: sanitizeText(replySchema.parse(input).body) };
  if (t?.customerId) await notifyCustomer(t.customerId, "ticketReply", data, key);
  else await queueEmail({ to: t?.guest?.email, template: "ticketReply", data, dedupeKey: key });
  return r;
}

/** Customer reads: scoped to the owner; thread is paginated with $slice so documents are never returned unbounded. */
export async function getTicketForCustomer(customerId: string, ticketId: string, threadPage = 1) {
  await connectDB();
  const skip = (Math.max(threadPage, 1) - 1) * THREAD_PAGE;
  const t = await Message.findOne({ _id: toObjectId(ticketId), customerId: toObjectId(customerId) }, { thread: { $slice: [skip, THREAD_PAGE] }, assignedTo: 0 }).lean();
  if (!t) throw notFound("Ticket"); // identical response for another customer's ticket
  return t;
}

export async function listCustomerTickets(customerId: string, page = 1, pageSize = 20) {
  await connectDB();
  const size = Math.min(Math.max(pageSize, 1), 50);
  const filter = { customerId: toObjectId(customerId) };
  const [items, total] = await Promise.all([
    Message.find(filter, { ticketNumber: 1, subject: 1, category: 1, status: 1, lastMessageAt: 1, messageCount: 1 }).sort({ lastMessageAt: -1 }).skip((Math.max(page, 1) - 1) * size).limit(size).lean(),
    Message.countDocuments(filter),
  ]);
  return { items, page, pageSize: size, total };
}

// ---- admin
export async function listTicketsAdmin(opts: { status?: string; page?: number; pageSize?: number } = {}) {
  await connectDB();
  const size = Math.min(Math.max(opts.pageSize ?? 20, 1), 50);
  const page = Math.max(opts.page ?? 1, 1);
  const filter: Record<string, unknown> = {};
  if (opts.status && ["open", "pending", "resolved", "closed"].includes(opts.status)) filter.status = opts.status;
  const [items, total] = await Promise.all([
    Message.find(filter, { thread: { $slice: 1 } }).sort({ lastMessageAt: -1 }).skip((page - 1) * size).limit(size).lean(),
    Message.countDocuments(filter),
  ]);
  return { items, page, pageSize: size, total, totalPages: Math.max(1, Math.ceil(total / size)) };
}

export async function getTicketAdmin(ticketId: string, threadPage = 1) {
  await connectDB();
  const skip = (Math.max(threadPage, 1) - 1) * THREAD_PAGE;
  const t = await Message.findById(toObjectId(ticketId), { thread: { $slice: [skip, THREAD_PAGE] } }).lean();
  if (!t) throw notFound("Ticket");
  return t;
}

export async function setTicketStatus(ticketId: string, status: "open" | "pending" | "resolved" | "closed") {
  await connectDB();
  const r = await Message.updateOne({ _id: toObjectId(ticketId) }, { $set: { status, ...(status === "resolved" ? { resolvedAt: new Date() } : {}) } });
  if (!r.matchedCount) throw notFound("Ticket");
}

export async function assignTicket(ticketId: string, adminObjectId: string) {
  await connectDB();
  const r = await Message.updateOne({ _id: toObjectId(ticketId) }, { $set: { assignedTo: toObjectId(adminObjectId, "adminId") } });
  if (!r.matchedCount) throw notFound("Ticket");
}
