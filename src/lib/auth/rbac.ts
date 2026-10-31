import type { AdminRole } from "@/models/Admin";

export type Permission =
  | "catalog.read" | "catalog.write" | "marketing.write" | "orders.read" | "orders.write" | "finance.write"
  | "customers.read" | "customers.write" | "support.read" | "support.write" | "reviews.moderate"
  | "settings.read" | "settings.write" | "admins.manage" | "audit.read" | "system";

const ALL: Permission[] = ["catalog.read", "catalog.write", "marketing.write", "orders.read", "orders.write", "finance.write", "customers.read", "customers.write", "support.read", "support.write", "reviews.moderate", "settings.read", "settings.write", "admins.manage", "audit.read", "system"];

/** Role -> permissions. `owner` is the only role that can manage admins, settings and view audit logs. */
export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  owner: ALL,
  catalog: ["catalog.read", "catalog.write", "marketing.write", "settings.read", "reviews.moderate", "support.read"],
  orders: ["orders.read", "orders.write", "customers.read", "support.read", "catalog.read", "settings.read"],
  finance: ["orders.read", "finance.write", "customers.read", "settings.read", "catalog.read"],
  support: ["support.read", "support.write", "reviews.moderate", "orders.read", "customers.read", "settings.read"],
};

/**
 * The single policy table: HTTP method + path -> required permission. Unknown admin paths require `system` (owner only),
 * so a newly added route is locked down by default until it is listed here.
 */
export function permissionFor(method: string, pathname: string): Permission {
  const read = method === "GET" || method === "HEAD";
  const seg = pathname.replace(/^\/api\/admin\/?/, "").split("/");
  const [a, , c, d] = seg;
  switch (a) {
    case "categories": case "pets": case "products": case "media": return read ? "catalog.read" : "catalog.write";
    case "coupons": return read ? "catalog.read" : "marketing.write";
    case "orders":
      if (c === "refund") return "finance.write";
      return read ? "orders.read" : "orders.write";
    case "returns": return c === "refund" ? "finance.write" : read ? "orders.read" : "orders.write";
    case "customers":
      if (c === "wallet" && (d === "adjust" || d === "reconcile")) return "finance.write";
      return read ? "customers.read" : "customers.write";
    case "reviews": return read ? "support.read" : "reviews.moderate";
    case "tickets": return read ? "support.read" : "support.write";
    case "dashboard": return "orders.read";
    case "settings": return read ? "settings.read" : "settings.write";
    case "admins": return "admins.manage";
    case "audit-logs": return "audit.read";
    default: return "system";
  }
}

export const can = (role: AdminRole, perm: Permission) => ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
