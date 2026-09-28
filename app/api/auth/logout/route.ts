import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { REFRESH_TOKEN_COOKIE, clearAuthCookies, hashRefreshToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (refreshToken) {
    const tokenHash = hashRefreshToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
}
