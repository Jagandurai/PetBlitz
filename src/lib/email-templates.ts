const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const inr = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const wrap = (title: string, bodyHtml: string, appUrl: string) => `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<div style="max-width:560px;margin:0 auto;padding:24px"><div style="font-size:22px;font-weight:700;color:#0f766e;margin-bottom:16px">🐾 PetBlitz</div>
<div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb"><h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>${bodyHtml}</div>
<p style="font-size:12px;color:#6b7280;margin-top:16px">You are receiving this because of activity on your PetBlitz account. <a href="${esc(appUrl)}" style="color:#0f766e">petblitz.in</a></p></div></body></html>`;

export type Mail = { subject: string; html: string; text: string };
type D = Record<string, unknown>;
const mk = (appUrl: string, subject: string, title: string, lines: string[], cta?: { label: string; path: string }): Mail => ({
  subject,
  html: wrap(title, lines.map((l) => `<p style="margin:0 0 10px;line-height:1.5">${esc(l)}</p>`).join("") + (cta ? `<p><a href="${esc(appUrl + cta.path)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">${esc(cta.label)}</a></p>` : ""), appUrl),
  text: `${title}\n\n${lines.join("\n")}${cta ? `\n\n${cta.label}: ${appUrl}${cta.path}` : ""}`,
});

/** Every template takes plain data; ALL values are HTML-escaped. */
export const TEMPLATES: Record<string, (d: D, appUrl: string) => Mail> = {
  orderPlaced: (d, u) => mk(u, `Order ${d.orderNumber} received`, "We have received your order", [`Hi ${d.name ?? "there"}, thanks for shopping with PetBlitz.`, `Order ${d.orderNumber} · Total ${inr(Number(d.total))}`, "We will confirm it as soon as payment is verified."], { label: "View order", path: `/account/orders/${d.orderId}` }),
  orderPaid: (d, u) => mk(u, `Payment received for ${d.orderNumber}`, "Payment received", [`We have received ${inr(Number(d.total))} for order ${d.orderNumber}.`, "Our team will start processing it shortly."], { label: "View order", path: `/account/orders/${d.orderId}` }),
  orderShipped: (d, u) => mk(u, `Order ${d.orderNumber} has shipped`, "Your order is on its way", [`Order ${d.orderNumber} was handed to ${d.partner ?? "our courier"}.`, d.trackingNumber ? `Tracking number: ${d.trackingNumber}` : "Tracking details will appear in your account."], { label: "Track order", path: `/account/orders/${d.orderId}` }),
  orderDelivered: (d, u) => mk(u, `Order ${d.orderNumber} delivered`, "Delivered", [`Order ${d.orderNumber} was delivered. We hope you love it!`, "Share a review to help other pet parents."], { label: "Write a review", path: `/account/orders/${d.orderId}` }),
  orderCancelled: (d, u) => mk(u, `Order ${d.orderNumber} cancelled`, "Order cancelled", [`Order ${d.orderNumber} has been cancelled.`, d.refunded ? `${inr(Number(d.refunded))} has been credited to your PetBlitz wallet.` : "No payment was taken."], { label: "View order", path: `/account/orders/${d.orderId}` }),
  refundToWallet: (d, u) => mk(u, `Refund of ${inr(Number(d.amount))} credited`, "Refund credited to your wallet", [`${inr(Number(d.amount))} has been added to your PetBlitz wallet${d.orderNumber ? ` for order ${d.orderNumber}` : ""}.`, "You can use it on your next order."], { label: "Open wallet", path: "/account/wallet" }),
  walletTopup: (d, u) => mk(u, `${inr(Number(d.amount))} added to your wallet`, "Wallet top-up successful", [`${inr(Number(d.amount))} was added to your wallet.`], { label: "Open wallet", path: "/account/wallet" }),
  ticketReply: (d, u) => mk(u, `Reply on ticket ${d.ticketNumber}`, "We replied to your request", [`Ticket ${d.ticketNumber}: ${d.subject}`, `"${String(d.preview ?? "").slice(0, 300)}"`], { label: "View conversation", path: `/account/support/${d.ticketId}` }),
  returnUpdate: (d, u) => mk(u, `Return ${d.returnNumber}: ${d.status}`, "Return request update", [`Your return request ${d.returnNumber} is now "${d.status}".`, d.note ? `Note from our team: ${d.note}` : ""].filter(Boolean) as string[], { label: "View returns", path: "/account/returns" }),
  welcome: (d, u) => mk(u, "Welcome to PetBlitz", "Welcome aboard", [`Hi ${d.name ?? "there"}, your PetBlitz account is ready.`], { label: "Start shopping", path: "/" }),
};
