import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * For uptime monitors and the container healthcheck: 200 only when the app can actually read its
 * database, 503 otherwise (a page that loads but can't sell isn't "up"). Says nothing else.
 */
export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
