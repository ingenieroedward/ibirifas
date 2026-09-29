import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_TTL_MS,
  clearAuthCookies,
  generateRefreshToken,
  hashRefreshToken,
  setAuthCookies,
  signAccessToken,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    const res = NextResponse.json({ error: "No autenticado" }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();

  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing || existing.revokedAt !== null || existing.expiresAt <= now) {
    const res = NextResponse.json({ error: "No autenticado" }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  const newRefreshToken = generateRefreshToken();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: now },
    }),
    prisma.refreshToken.create({
      data: {
        tokenHash: hashRefreshToken(newRefreshToken),
        userId: existing.userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    }),
  ]);

  const accessToken = signAccessToken(existing.userId);

  const res = NextResponse.json({ ok: true });
  setAuthCookies(res, { accessToken, refreshToken: newRefreshToken });
  return res;
}
