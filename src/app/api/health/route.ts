import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Application liveness only. Does not touch the database (see /api/admin/db-status for that). */
export async function GET() {
  return NextResponse.json({ success: true, data: { status: "ok", service: "petblitz", time: new Date().toISOString() } });
}
