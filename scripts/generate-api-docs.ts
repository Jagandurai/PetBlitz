import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ENDPOINTS, VARIABLES, Endpoint } from "./endpoints";

/** Generates the importable Thunder Client collection/environment and docs/API.md from scripts/endpoints.ts. Placeholders only - no secrets. */
const id = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 8) + "-" + createHash("sha1").update(s + "x").digest("hex").slice(0, 4) + "-" + createHash("sha1").update(s + "y").digest("hex").slice(0, 4) + "-" + createHash("sha1").update(s + "z").digest("hex").slice(0, 12);
const NOW = "2026-01-01T00:00:00.000Z";
const colId = id("collection:PetBlitz");

const groups = [...new Set(ENDPOINTS.map((e) => e.group))];
const folders = groups.map((g, i) => ({ _id: id("folder:" + g), name: g, containerId: "", created: NOW, sortNum: (i + 1) * 10000 }));

function headers(e: Endpoint) {
  const h: { name: string; value: string }[] = [];
  if (e.auth === "admin") h.push({ name: "Authorization", value: "Bearer {{adminKey}}" });
  if (e.auth === "customer") h.push({ name: "Authorization", value: "Bearer {{customerToken}}" });
  if (e.auth === "cron") h.push({ name: "Authorization", value: "Bearer {{cronSecret}}" });
  for (const [k, v] of Object.entries(e.headers ?? {})) h.push({ name: k, value: v });
  if (e.body !== undefined) h.push({ name: "Content-Type", value: "application/json" });
  return h;
}

const requests = ENDPOINTS.map((e, i) => ({
  _id: id(`req:${e.method}:${e.path}:${e.name}`), colId, containerId: folders[groups.indexOf(e.group)]!._id, name: e.name,
  url: `{{baseUrl}}${e.path}${e.query ? "?" + e.query : ""}`, method: e.method, sortNum: (i + 1) * 10000, created: NOW, modified: NOW,
  headers: headers(e),
  params: (e.query ?? "").split("&").filter(Boolean).map((kv) => ({ name: kv.split("=")[0], value: kv.split("=")[1] ?? "", isPath: false })),
  body: e.body !== undefined ? { type: "json", raw: JSON.stringify(e.body, null, 2), form: [] } : { type: "none", raw: "", form: [] },
  tests: [{ type: "res-code", custom: "", action: "equal", value: String(e.expect ?? 200) }],
}));

const outDir = "thunder-client";
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "thunder-collection_PetBlitz.json"), JSON.stringify({ client: "Thunder Client", collectionName: "PetBlitz API", dateExported: NOW, version: "1.2", folders, requests }, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, "thunder-environment_PetBlitz.json"), JSON.stringify({ _id: id("env:local"), name: "PetBlitz Local (placeholders)", default: true, global: false, sortNum: 10000, created: NOW, modified: NOW, data: Object.entries(VARIABLES).map(([name, value]) => ({ name, value })) }, null, 2) + "\n");

// ------------------------------------------------------------------ docs/API.md
const authLabel: Record<string, string> = { public: "none", admin: "Admin key", customer: "Customer session", cron: "Cron secret", webhook: "Razorpay signature" };
let md = `# PetBlitz HTTP API

_Generated from \`scripts/endpoints.ts\` by \`npm run docs:generate\`. Do not edit by hand._

## Conventions
* Base URL \`http://localhost:3000\`. Bodies are JSON (max 100 KB). Money is **integer paise** (INR minor units).
* **Success:** \`{ "success": true, "data": ... }\` &nbsp; **Error:** \`{ "success": false, "error": { "code": "...", "message": "...", "details"?: [...] } }\`
* Status codes: 200/201 ok · 400 validation / bad JSON / bad id · 401 not authenticated · 403 forbidden / CSRF / suspended · 404 not found · 409 business-rule conflict · 413 body too large · 422 unprocessable rule · 429 rate limited · 503 dependency not configured/unavailable.
* **Admin auth:** \`Authorization: Bearer <ADMIN_API_KEY>\` (server-side only; never ship it to browsers). Checked before body parsing or any DB access.
* **Customer auth:** signed session — \`pb_session\` HttpOnly cookie (set by \`POST /api/auth/google\`) or \`Authorization: Bearer <session token>\`. Cookie-authenticated writes also require a matching \`Origin\` header (CSRF).
* **Scheduler auth:** \`Authorization: Bearer <CRON_SECRET>\`.

## Endpoints (${ENDPOINTS.length})
`;
for (const g of groups) {
  md += `\n### ${g}\n\n| Method | Path | Auth | Description |\n|---|---|---|---|\n`;
  for (const e of ENDPOINTS.filter((x) => x.group === g)) md += `| ${e.method} | \`${e.path}${e.query ? "?" + e.query : ""}\` | ${authLabel[e.auth]} | ${e.desc} |\n`;
}
md += `\n## Request examples\n`;
for (const e of ENDPOINTS.filter((x) => x.body !== undefined && x.auth !== "webhook")) {
  const bearer = e.auth === "admin" ? ' -H "Authorization: Bearer $ADMIN_API_KEY"' : e.auth === "customer" ? ' -H "Authorization: Bearer $CUSTOMER_TOKEN"' : "";
  md += `\n**${e.name}** — \`${e.method} ${e.path}\`\n\`\`\`bash\ncurl -X ${e.method} "$BASE${e.path}"${bearer} -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(e.body)}'\n\`\`\`\n`;
}
fs.writeFileSync("docs/API.md", md);
console.log(`Generated ${requests.length} requests in ${folders.length} folders + docs/API.md`);
