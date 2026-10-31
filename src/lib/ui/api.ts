/** Browser-side API client. Same-origin, cookie-authenticated (HttpOnly session cookies are attached by the browser). */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { path: string; message: string }[]) { super(message); }
}

/** Expired/invalid session: send the user straight to the matching login page. */
function redirectToLogin(path: string) {
  const here = window.location.pathname;
  if (path.startsWith("/api/admin/")) {
    if (path.startsWith("/api/admin/auth/login") || path.startsWith("/api/admin/auth/google") || here.startsWith("/admin/login")) return;
    window.location.replace("/admin/login");
  } else if (path.startsWith("/api/") && !path.startsWith("/api/auth/") && here !== "/login") {
    window.location.replace(`/login?next=${encodeURIComponent(here)}`);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: opts.method ?? "GET", credentials: "same-origin", headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: opts.signal, cache: "no-store" });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK", "Network error. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: { code: string; message: string; details?: { path: string; message: string }[] } } | null;
  if (res.status === 401 && typeof window !== "undefined") redirectToLogin(path);
  if (!res.ok || !json?.success) throw new ApiError(res.status, json?.error?.code ?? "ERROR", json?.error?.message ?? `Request failed (${res.status})`, json?.error?.details);
  return json.data as T;
}

export const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** Friendly text for an error, including per-field validation messages. */
export const errText = (e: unknown) => {
  if (e instanceof ApiError) return e.details?.length ? `${e.message}: ${e.details.map((d) => `${d.path || "field"} ${d.message}`).join("; ")}` : e.message;
  return e instanceof Error ? e.message : "Something went wrong";
};
