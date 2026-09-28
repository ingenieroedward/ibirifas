import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateRefreshToken,
  hashRefreshToken,
  isValidLoginCode,
  REFRESH_TOKEN_TTL_MS,
  setAuthCookies,
  signAccessToken,
} from "@/lib/auth";
import { checkLoginRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkLoginRateLimit(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta de nuevo más tarde." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const code = typeof body === "object" && body !== null ? (body as Record<string, unknown>).code : undefined;

  if (typeof code !== "string" || !isValidLoginCode(code)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  const activeUsers = await prisma.adminUser.findMany({ where: { active: true } });

  let matchedUser: (typeof activeUsers)[number] | null = null;
  for (const user of activeUsers) {
    const matches = await bcrypt.compare(code, user.codeHash);
    if (matches) {
      matchedUser = user;
      break;
    }
  }

  if (!matchedUser) {
    return NextResponse.json({ error: "Código inválido" }, { status: 401 });
  }

  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashRefreshToken(refreshToken),
      userId: matchedUser.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  const accessToken = signAccessToken(matchedUser.id);

  const res = NextResponse.json({ user: { id: matchedUser.id, name: matchedUser.name } });
  setAuthCookies(res, { accessToken, refreshToken });
  return res;
}
