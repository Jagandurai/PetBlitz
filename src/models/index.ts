import { Category } from "./Category";
import { Product } from "./Product";
import { Customer } from "./Customer";
import { Order } from "./Order";
import { Payment } from "./Payment";
import { Review } from "./Review";
import { Message } from "./Message";
import { Counter } from "./Counter";
import { WalletTransaction } from "./WalletTransaction";
import { AdminUser, AdminSession, AuditLog } from "./Admin";
import { StoreSettings, Cart, Coupon, CouponRedemption } from "./Store";
import { EmailOutbox, Invoice, ReturnRequest, InventoryMovement } from "./Ops";
import { Blog } from "./Blog";
import { Banner } from "./Banner";

export { AdminUser, AdminSession, AuditLog, StoreSettings, Cart, Coupon, CouponRedemption, EmailOutbox, Invoice, ReturnRequest, InventoryMovement, WalletTransaction, Category, Product, Customer, Order, Payment, Review, Message, Counter, Blog, Banner };

export const CORE_MODELS = { categories: Category, products: Product, customers: Customer, orders: Order, payments: Payment, reviews: Review, messages: Message } as const;
export const SUPPORT_MODELS = { counters: Counter, wallet_transactions: WalletTransaction, admin_users: AdminUser, admin_sessions: AdminSession, admin_audit_logs: AuditLog, store_settings: StoreSettings, carts: Cart, coupons: Coupon, coupon_redemptions: CouponRedemption, email_outbox: EmailOutbox, invoices: Invoice, return_requests: ReturnRequest, inventory_movements: InventoryMovement, blogs: Blog, banners: Banner } as const;
export const REQUIRED_COLLECTIONS = Object.keys(CORE_MODELS);
