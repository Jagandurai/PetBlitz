"use client";
import { createContext, ReactNode, useContext } from "react";

export interface AdminMe { id: string; email?: string; role: string; via: "api-key" | "session"; mfaSetupRequired: boolean; permissions: string[] }
export const AdminCtx = createContext<{ me: AdminMe | null; can: (p: string) => boolean; reload: () => void }>({ me: null, can: () => false, reload: () => undefined });
export const useAdmin = () => useContext(AdminCtx);
/** UI-only gate (the server enforces every permission). Hides what the signed-in role cannot use. */
export const Can = ({ perm, children }: { perm: string; children: ReactNode }) => (useAdmin().can(perm) ? <>{children}</> : null);

export interface CatNode { id: string; name: string; slug: string; type: string; level: number; parentId: string | null; isActive: boolean; isVisible: boolean; archivedAt: string | null; sortOrder: number; isFeatured: boolean; description?: string; children: CatNode[] }
export const flattenCats = (n: CatNode[], depth = 0): (CatNode & { label: string })[] => n.flatMap((c) => [{ ...c, label: `${"— ".repeat(depth)}${c.name}${c.archivedAt ? " (archived)" : ""}` }, ...flattenCats(c.children, depth + 1)]);
