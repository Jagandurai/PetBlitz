/** Where to go after sign-in: a same-site relative path only (no open redirect), and never back to the login page. */
export function safeNext(raw: string | null | undefined, fallback = "/account"): string {
  if (!raw || raw[0] !== "/" || raw[1] === "/" || /[\\\u0000-\u001F]/.test(raw)) return fallback; // browsers read "\" as "/"
  const u = new URL(raw, "http://same.invalid");
  if (u.origin !== "http://same.invalid" || u.pathname === "/login") return fallback;
  return `${u.pathname}${u.search}${u.hash}`;
}
