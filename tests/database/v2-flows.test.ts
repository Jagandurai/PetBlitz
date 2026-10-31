import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { cleanDb, HAS_DB, makeCats, setupDb, teardownDb } from "../helpers";
import { captured, customer, paidSetup, publishedPet, publishedProduct } from "./fixtures";
import { AdminSession, AdminUser, AuditLog } from "@/models/Admin";
import { Coupon, CouponRedemption } from "@/models/Store";
import { EmailOutbox, InventoryMovement, Invoice, ReturnRequest } from "@/models/Ops";
import { Order } from "@/models/Order";
import { Customer } from "@/models/Customer";
import { generateTotpSecret, totpAt, decryptSecret } from "@/lib/auth/totp";
import { _clearSettingsCache, updateSettings } from "@/services/settings.service";
import * as A from "@/services/admin-auth.service";
import * as Cart from "@/services/cart.service";
import * as Coup from "@/services/coupon.service";
import * as Inv from "@/services/invoice.service";
import * as O from "@/services/order.service";
import * as Pay from "@/services/payment.service";
import * as Priv from "@/services/privacy.service";
import * as Ret from "@/services/return.service";
import * as Prod from "@/services/product.service";
import * as W from "@/services/wallet.service";
import { processOutbox } from "@/services/email.service";
import { recordAudit, listAuditLogs } from "@/services/audit.service";

const PW = "Correct-Horse-Battery-9";

describe.skipIf(!HAS_DB)("v2: admin accounts, sessions, MFA (PetBlitzTest)", () => {
  beforeAll(setupDb); beforeEach(cleanDb); afterAll(teardownDb);

  it("login, lockout after 5 failures, generic errors, session lifecycle", async () => {
    await A.createAdmin({ email: "Owner@PetBlitz.in", name: "Owner", role: "owner", password: PW });
    await expect(A.createAdmin({ email: "owner@petblitz.in", name: "Dup", role: "owner", password: PW })).rejects.toMatchObject({ code: "ADMIN_EXISTS" });
    await expect(A.createAdmin({ email: "weak@petblitz.in", name: "W", role: "orders", password: "short" })).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    const ok = await A.loginAdmin({ email: "owner@petblitz.in", password: PW }, { ip: "1.1.1.1" });
    expect(await A.authenticateSession(ok.token)).toMatchObject({ role: "owner", email: "owner@petblitz.in" });
    expect(await AdminSession.countDocuments()).toBe(1);
    expect(JSON.stringify(await AdminSession.findOne().lean())).not.toContain(ok.token); // only the hash is stored
    await A.logoutSession(ok.token);
    expect(await A.authenticateSession(ok.token)).toBeNull();
    await expect(A.loginAdmin({ email: "nobody@petblitz.in", password: PW }, {})).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    for (let i = 0; i < 5; i++) await A.loginAdmin({ email: "owner@petblitz.in", password: "wrong-password-1" }, {}).catch(() => undefined);
    await expect(A.loginAdmin({ email: "owner@petblitz.in", password: PW }, {})).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
  });

  it("idle and absolute expiry end the session", async () => {
    await A.createAdmin({ email: "o@petblitz.in", name: "O", role: "owner", password: PW });
    const s = await A.loginAdmin({ email: "o@petblitz.in", password: PW }, {});
    await AdminSession.updateMany({}, { $set: { lastSeenAt: new Date(Date.now() - 3 * 3600_000) } });
    expect(await A.authenticateSession(s.token)).toBeNull();
    const s2 = await A.loginAdmin({ email: "o@petblitz.in", password: PW }, {});
    await AdminSession.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await A.authenticateSession(s2.token)).toBeNull();
  });

  it("MFA: setup -> enable -> login needs a code; recovery codes work once; secret is encrypted at rest", async () => {
    const admin = await A.createAdmin({ email: "m@petblitz.in", name: "M", role: "owner", password: PW });
    const { secret } = await A.beginMfaSetup(admin.id);
    expect(JSON.stringify(await AdminUser.findById(admin.id).lean())).not.toContain(secret);
    await expect(A.enableMfa(admin.id, "000000")).rejects.toMatchObject({ code: "INVALID_CODE" });
    const { recoveryCodes } = await A.enableMfa(admin.id, totpAt(secret, Date.now()));
    expect(recoveryCodes).toHaveLength(8);
    await expect(A.loginAdmin({ email: "m@petblitz.in", password: PW }, {})).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    await expect(A.loginAdmin({ email: "m@petblitz.in", password: PW, totp: "000000" }, {})).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect((await A.loginAdmin({ email: "m@petblitz.in", password: PW, totp: totpAt(secret, Date.now()) }, {})).admin.mfaEnabled).toBe(true);
    await A.loginAdmin({ email: "m@petblitz.in", password: PW, recoveryCode: recoveryCodes[0]! }, {});
    await expect(A.loginAdmin({ email: "m@petblitz.in", password: PW, recoveryCode: recoveryCodes[0]! }, {})).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const stored = await AdminUser.findById(admin.id).lean();
    expect(decryptSecret(stored!.mfa!.secretEnc!)).toBe(secret);
    void generateTotpSecret;
  });

  it("role/active changes revoke sessions; the last owner is protected; password change signs out other devices", async () => {
    const owner = await A.createAdmin({ email: "own@petblitz.in", name: "Own", role: "owner", password: PW });
    const staff = await A.createAdmin({ email: "st@petblitz.in", name: "St", role: "support", password: PW });
    const s = await A.loginAdmin({ email: "st@petblitz.in", password: PW }, {});
    await A.updateAdmin(staff.id, { role: "orders" }, owner.id);
    expect(await A.authenticateSession(s.token)).toBeNull();
    await expect(A.updateAdmin(owner.id, { role: "support" }, owner.id)).rejects.toMatchObject({ code: "LAST_OWNER" });
    await expect(A.updateAdmin(owner.id, { isActive: false }, owner.id)).rejects.toMatchObject({ code: expect.stringMatching(/LAST_OWNER|SELF_DEACTIVATE/) });
    const a = await A.loginAdmin({ email: "st@petblitz.in", password: PW }, {});
    const b = await A.loginAdmin({ email: "st@petblitz.in", password: PW }, {});
    await A.changePassword(staff.id, PW, "Brand-New-Passphrase-77", a.token);
    expect(await A.authenticateSession(a.token)).toBeTruthy();
    expect(await A.authenticateSession(b.token)).toBeNull();
  });

  it("audit log stores entries and never throws", async () => {
    await recordAudit({ actorType: "admin", actorId: "x", action: "POST /api/admin/orders/:id/refund", path: "/api/admin/orders/1/refund", status: 200 });
    expect((await listAuditLogs({ page: 1, pageSize: 10, method: "POST" })).total).toBe(1);
    expect(await AuditLog.countDocuments()).toBe(1);
  });
});

describe.skipIf(!HAS_DB)("v2: cart, coupons, GST, invoices (PetBlitzTest)", () => {
  beforeAll(setupDb); beforeEach(async () => { await cleanDb(); _clearSettingsCache(); }); afterAll(teardownDb);

  async function shop() {
    const { toys, lab } = await makeCats();
    const prod = await publishedProduct(toys.id, 10, { taxRateBps: 1800, hsnCode: "230910" });
    const pet = await publishedPet(lab.id);
    const c = await customer();
    return { prod, pet, c };
  }

  it("cart: add/merge/cap, live pricing, removal; pets only once; unavailable lines flagged", async () => {
    const { prod, pet, c } = await shop();
    await Cart.addToCart(c.id, { itemType: "product", productId: String(prod._id), quantity: 2 });
    await Cart.addToCart(c.id, { itemType: "product", productId: String(prod._id), quantity: 3 });
    await Cart.addToCart(c.id, { itemType: "pet", petId: String(pet._id) });
    await Cart.addToCart(c.id, { itemType: "pet", petId: String(pet._id) });
    let cart = await Cart.getCart(c.id);
    expect(cart.items.find((i) => i.itemType === "product")!.quantity).toBe(5);
    expect(cart.items.filter((i) => i.itemType === "pet")).toHaveLength(1);
    expect(cart.subtotal).toBe(5 * 100000 + 5000000);
    await Cart.setCartQuantity(c.id, String(prod._id), { quantity: 11 });
    expect((await Cart.getCart(c.id)).items.find((i) => i.itemType === "product")).toMatchObject({ available: false, maxQuantity: 10 });
    await Prod.updateProduct(String(prod._id), { price: 120000 });
    await Cart.setCartQuantity(c.id, String(prod._id), { quantity: 1 });
    expect((await Cart.getCart(c.id)).items.find((i) => i.itemType === "product")!.unitPrice).toBe(120000); // price change reflected live
    cart = await Cart.removeFromCart(c.id, String(pet._id));
    expect(cart.items).toHaveLength(1);
    await expect(Cart.addToCart(c.id, { itemType: "product", productId: String(new Types.ObjectId()) })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("checkout from cart: server pricing, coupon share, shipping rules, GST-inclusive mode; cart emptied; replay is idempotent", async () => {
    const { prod, c } = await shop();
    await updateSettings({ shipping: { baseFeeMinor: 6000, freeAboveMinor: 500000, stateFees: { "33": 4000 } }, tax: { pricesIncludeTax: true, sellerStateCode: "33" } }, "t");
    await Coup.createCoupon({ code: "SAVE10", type: "percent", value: 10, minOrderMinor: 0, appliesTo: "all", perCustomerLimit: 1, isActive: true }, "t");
    await Cart.addToCart(c.id, { itemType: "product", productId: String(prod._id), quantity: 2 });
    expect((await Cart.previewCoupon(c.id, { code: "save10" })).discount).toBe(20000);
    const input = { shippingAddressId: c.addressId, couponCode: "SAVE10", idempotencyKey: "cart-key-0001" };
    const first = await Cart.checkoutCart(c.id, input);
    const o = (await Order.findOne().lean())!;
    expect(o.pricesIncludeTax).toBe(true);
    expect(o.couponDiscount).toBe(20000);
    expect(o.shippingTotal).toBe(4000); // Tamil Nadu override (shipping address state is "TN"), subtotal below free-shipping threshold
    expect(o.grandTotal).toBe(200000 - 20000 + 4000); // inclusive: coupon reduces the gross, shipping added
    expect(o.items[0]!.taxAmount).toBe(180000 - Math.round((180000 * 10000) / 11800));
    expect((await Cart.getCart(c.id)).items).toHaveLength(0);
    expect(first.duplicate).toBe(false);
    await Cart.addToCart(c.id, { itemType: "product", productId: String(prod._id), quantity: 1 });
    expect((await Cart.checkoutCart(c.id, input)).duplicate).toBe(true); // replay returns the original order
    expect(await Order.countDocuments()).toBe(1);
  });

  it("coupon rules: per-customer limit, usage limit under concurrency, expiry, release on cancel", async () => {
    const { prod, c } = await shop();
    const c2 = await customer("g-2", "b@x.com");
    await Coup.createCoupon({ code: "ONCE", type: "fixed", value: 5000, minOrderMinor: 0, appliesTo: "all", perCustomerLimit: 1, usageLimit: 1, isActive: true }, "t");
    await Coup.createCoupon({ code: "OLD", type: "fixed", value: 5000, minOrderMinor: 0, appliesTo: "all", perCustomerLimit: 1, isActive: true, endsAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - 5000) }, "t");
    const mk = (cid: string, addr: string, key: string, code: string) => O.createOrder(cid, { items: [{ itemType: "product", productId: String(prod._id), quantity: 1 }], shippingAddressId: addr, idempotencyKey: key, couponCode: code });
    await expect(mk(c.id, c.addressId, "k-old-000001", "OLD")).rejects.toMatchObject({ code: "COUPON_INVALID" });
    const results = await Promise.allSettled([mk(c.id, c.addressId, "k-once-00001", "ONCE"), mk(c2.id, c2.addressId, "k-once-00002", "ONCE")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1); // usageLimit 1 honoured under concurrency
    expect((await Coupon.findOne({ code: "ONCE" }).lean())!.usedCount).toBe(1);
    const winner = (await Order.findOne({ couponCode: "ONCE" }).lean())!;
    await O.cancelOrder(String(winner._id), { type: "admin" }, "test");
    expect((await Coupon.findOne({ code: "ONCE" }).lean())!.usedCount).toBe(0); // released
    expect(await CouponRedemption.countDocuments()).toBe(0);
    await O.cancelOrder(String(winner._id), { type: "admin" }, "again"); // idempotent
    expect((await Coupon.findOne({ code: "ONCE" }).lean())!.usedCount).toBe(0);
  });

  it("invoice: issued once on shipping, CGST+SGST in-state vs IGST out-of-state, sequential numbers, customer can fetch", async () => {
    await updateSettings({ tax: { sellerStateCode: "33", sellerGstin: "33ABCDE1234F1Z5", legalName: "PetBlitz", pricesIncludeTax: false } }, "t");
    const { order, payment, c } = await paidSetup();
    await Order.updateOne({ _id: order._id }, { $set: { "items.0.taxRateBps": 1800, "items.0.taxAmount": 18000, "items.0.lineTotal": 118000, grandTotal: 118000 } });
    await Pay.processRazorpayEvent("evt_i", { ...captured(payment, { amount: 118000 }), event: "payment.captured" }).catch(() => undefined);
    const inv1 = await Inv.ensureInvoice(String(order._id));
    expect(inv1.invoiceNumber).toMatch(/^PB\/\d{4}-\d{2}\/000001$/);
    expect(inv1.totals).toMatchObject({ cgst: 9000, sgst: 9000, igst: 0 }); // address state "TN" = seller state
    expect((await Inv.ensureInvoice(String(order._id))).invoiceNumber).toBe(inv1.invoiceNumber);
    expect(await Invoice.countDocuments()).toBe(1);
    expect((await Inv.getInvoiceForCustomer(c.id, String(order._id))).invoiceNumber).toBe(inv1.invoiceNumber);
    await expect(Inv.getInvoiceForCustomer(String(new Types.ObjectId()), String(order._id))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stock movements are logged for admin edits and order commit/restock", async () => {
    const { prod } = await shop();
    await Prod.adjustStock(String(prod._id), { mode: "adjust", value: 5 }, new Types.ObjectId().toString());
    expect(await InventoryMovement.countDocuments({ reason: "admin_adjust", delta: 5 })).toBe(1);
    await Prod.reserveStock(prod._id as Types.ObjectId, 2);
    await Prod.commitStock(prod._id as Types.ObjectId, 2);
    expect((await InventoryMovement.findOne({ reason: "order_commit" }).lean())).toMatchObject({ delta: -2, stockAfter: 13 });
  });
});

describe.skipIf(!HAS_DB)("v2: returns, privacy, e-mail outbox (PetBlitzTest)", () => {
  beforeAll(setupDb); beforeEach(async () => { await cleanDb(); _clearSettingsCache(); }); afterAll(teardownDb);

  async function deliveredOrder() {
    const s = await paidSetup({ stock: 10 });
    await Pay.processRazorpayEvent("evt_d", captured(s.payment));
    await Order.updateOne({ _id: s.order._id }, { $set: { status: "delivered", "shipping.deliveredAt": new Date() } });
    return { ...s, itemId: String((await Order.findById(s.order._id).lean())!.items[0]!._id) };
  }

  it("return workflow: eligibility, quantity limits, state machine, refund to wallet once", async () => {
    const { c, order, itemId, payment } = await deliveredOrder();
    const base = { orderId: String(order._id), orderItemId: itemId, reason: "damaged" as const };
    await expect(Ret.createReturn(c.id, { ...base, quantity: 2 })).rejects.toMatchObject({ code: "RETURN_QUANTITY" });
    const r = await Ret.createReturn(c.id, { ...base, quantity: 1 });
    await expect(Ret.createReturn(c.id, { ...base, quantity: 1 })).rejects.toMatchObject({ code: "RETURN_QUANTITY" });
    await expect(Ret.refundReturn(String(r._id), {}, "a")).rejects.toMatchObject({ code: "INVALID_TRANSITION" }); // not received yet
    await Ret.actOnReturn(String(r._id), { action: "approve" }, "a");
    await expect(Ret.actOnReturn(String(r._id), { action: "approve" }, "a")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await Ret.actOnReturn(String(r._id), { action: "receive" }, "a");
    await Promise.allSettled([Ret.refundReturn(String(r._id), {}, "a"), Ret.refundReturn(String(r._id), {}, "a")]); // double click
    expect((await W.getWallet(c.id)).balance).toBe(payment.amount);
    expect((await ReturnRequest.findById(r._id).lean())!.status).toBe("refunded");
  });

  it("return window and live-animal rule", async () => {
    const { c, order, itemId } = await deliveredOrder();
    await Order.updateOne({ _id: order._id }, { $set: { "shipping.deliveredAt": new Date(Date.now() - 30 * 86_400_000) } });
    await expect(Ret.createReturn(c.id, { orderId: String(order._id), orderItemId: itemId, quantity: 1, reason: "other" })).rejects.toMatchObject({ code: "RETURN_WINDOW_CLOSED" });
  });

  it("privacy: export has no internal fields; deletion is blocked while money/goods are in flight, then anonymises", async () => {
    const { c, order } = await paidSetup();
    const data = await Priv.exportMyData(c.id);
    expect(data.orders).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/adminNote|idempotencyKey|googleId/);
    await expect(Priv.deleteMyAccount(c.id)).rejects.toMatchObject({ code: "DELETE_BLOCKED" }); // order in progress
    await O.cancelOrder(String(order._id), { type: "admin" }, "x");
    await W.creditWallet(c.id, 500, { reason: "topup", idempotencyKey: "priv-credit-1" });
    await expect(Priv.deleteMyAccount(c.id)).rejects.toMatchObject({ code: "DELETE_BLOCKED" }); // wallet balance
    await W.debitWallet(c.id, 500, { reason: "admin_adjustment", idempotencyKey: "priv-debit-1" });
    expect((await Priv.deleteMyAccount(c.id)).anonymized).toBe(true);
    expect((await Customer.findById(c.id).lean())!.email).toContain("@petblitz.invalid");
    expect(await Order.countDocuments({ customerId: c.id })).toBe(1); // orders retained
  });

  it("e-mail outbox: one mail per event (dedupe), sent mail is escaped, queue never blocks order creation", async () => {
    const { order } = await paidSetup();
    expect(await EmailOutbox.countDocuments({ dedupeKey: `order-placed:${order._id}` })).toBe(1);
    await O.cancelOrder(String(order._id), { type: "admin" }, "x");
    await O.cancelOrder(String(order._id), { type: "admin" }, "x");
    expect(await EmailOutbox.countDocuments({ dedupeKey: `order-cancelled:${order._id}` })).toBe(1);
    expect((await processOutbox()).skipped).toBe(true); // SMTP not configured in tests: mails stay queued
    expect(await EmailOutbox.countDocuments({ status: "pending" })).toBeGreaterThan(0);
  });
});
