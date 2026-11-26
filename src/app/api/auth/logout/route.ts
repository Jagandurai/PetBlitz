import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/auth/customer";
import { clearSessionCookie } from "@/lib/auth/session";
import { handle, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    assertSameOrigin(req);
    const res = ok({ signedOut: true });
    res.headers.append("Set-Cookie", clearSessionCookie());
    return res;
  });
}
