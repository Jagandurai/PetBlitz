import { NextResponse } from "next/server";
import { z } from "zod";
import { admin, queryOf } from "@/lib/route";
import { getSalesReport, reportCsv } from "@/services/dashboard.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const q = z.object({ period: z.enum(["daily", "weekly", "monthly", "yearly"]).default("daily"), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/** Sales report grouped by day / week / month / year, downloaded as CSV. Paid orders only; amounts in rupees. */
export const GET = admin(async ({ req }) => {
  const { period, from, to } = q.parse(queryOf(req));
  const rows = await getSalesReport(period, from, to);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(reportCsv(rows), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="petblitz-sales-${period}-${stamp}.csv"`, "Cache-Control": "no-store" } });
});
