"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiInfo, FiX } from "react-icons/fi";
import { api, ApiError, errText } from "./api";

/** GET with loading/error state. `path = null` skips the request. Re-fetches when `path` changes or reload() is called. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) { setLoading(false); return; }
    const ac = new AbortController();
    setLoading(true); setError(null);
    api<T>(path, { signal: ac.signal }).then((d) => { setData(d); setLoading(false); }).catch((e) => { if ((e as Error).name === "AbortError") return; setError(errText(e)); setLoading(false); });
    return () => ac.abort();
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

// ---------------------------------------------------------------- toasts
type Toast = { id: number; msg: string; kind: "ok" | "err" | "" };
const ToastCtx = createContext<{ toast: (msg: string, kind?: Toast["kind"]) => void }>({ toast: () => undefined });
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const n = useRef(0);
  const toast = useCallback((msg: string, kind: Toast["kind"] = "") => {
    const id = ++n.current;
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  return <ToastCtx.Provider value={{ toast }}>{children}<div className="toasts" role="status" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast ${t.kind}`}><span className="ti">{t.kind === "ok" ? <FiCheckCircle /> : t.kind === "err" ? <FiAlertCircle /> : <FiInfo />}</span><span className="grow">{t.msg}</span><button aria-label="Dismiss" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}><FiX /></button></div>)}</div></ToastCtx.Provider>;
}

/** Runs an async action with a busy flag and toast feedback. */
export function useAction() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast(okMsg, "ok"); return r; }
    catch (e) { toast(errText(e), "err"); return undefined; }
    finally { setBusy(false); }
  }, [toast]);
  return { busy, run };
}

// ---------------------------------------------------------------- customer session
export interface Me { id: string; email: string; firstName?: string; lastName?: string; displayName?: string; phone?: string; avatarUrl?: string; wallet: { balance: number }; addresses: Address[]; defaultShippingAddressId?: string; defaultBillingAddressId?: string; marketingConsent?: { granted: boolean }; preferences?: { newsletter?: boolean } }
export interface Address { id: string; label?: string; recipientName: string; phone: string; line1: string; line2?: string; landmark?: string; city: string; state: string; postalCode: string; countryCode: string }
interface AuthState { me: Me | null; loading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void>; cartCount: number; refreshCart: () => Promise<void> }
const AuthCtx = createContext<AuthState>({ me: null, loading: true, refresh: async () => undefined, signOut: async () => undefined, cartCount: 0, refreshCart: async () => undefined });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState(0);
  const refreshCart = useCallback(async () => { try { setCartCount((await api<{ itemCount: number }>("/api/me/cart")).itemCount); } catch { setCartCount(0); } }, []);
  const refresh = useCallback(async () => {
    try { setMe(await api<Me>("/api/me")); await refreshCart(); }
    catch (e) { if (!(e instanceof ApiError) || e.status !== 401) console.error(errText(e)); setMe(null); setCartCount(0); }
    finally { setLoading(false); }
  }, [refreshCart]);
  useEffect(() => { void refresh(); }, [refresh]);
  const signOut = useCallback(async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => undefined); setMe(null); setCartCount(0); }, []);
  return <AuthCtx.Provider value={{ me, loading, refresh, signOut, cartCount, refreshCart }}>{children}</AuthCtx.Provider>;
}
