import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { REFRESH_TOKEN_COOKIE, hashRefreshToken, isValidLoginCode } from "@/lib/auth";
import { checkLoginRateLimit, getClientIp } from "@/lib/rateLimit";
import { codeUsedInTeam } from "@/lib/team";
import { isWeakLoginCode } from "@/lib/orgCode";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";

const BCRYPT_ROUNDS = 10;

const schema = z.object({ currentCode: z.string(), newCode: z.string() });

/**
 * Anyone signed in (the platform owner included) changes their own 6-digit code. The current code is
 * asked again so a phone left unlocked can't be used to take the account over; failed attempts count
 * against the same per-IP allowance as logging in. Every other session of the account is closed; this
 * one stays open.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody(req, BODY_LIMITS.small);
  if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { currentCode, newCode } = parsed.data;

  if (!checkLoginRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Demasiados intentos. Intenta de nuevo más tarde." }, { status: 429 });
  }
  const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: user.id }, select: { codeHash: true } });
  if (!isValidLoginCode(currentCode) || !(await bcrypt.compare(currentCode, row.codeHash))) {
    return NextResponse.json({ error: "Tu código actual no es correcto." }, { status: 403 });
  }
  if (!isValidLoginCode(newCode)) {
    return NextResponse.json({ error: "El código nuevo debe tener 6 dígitos." }, { status: 400 });
  }
  if (newCode === currentCode) {
    return NextResponse.json({ error: "El código nuevo debe ser distinto al actual." }, { status: 400 });
  }
  if (isWeakLoginCode(newCode)) {
    return NextResponse.json({ error: "Ese código es muy fácil de adivinar (repetido o seguido). Elige otro." }, { status: 400 });
  }

  // Codes are unique inside a team (organizer + sellers); the platform owners form their own.
  const organizerId = user.role === "ORGANIZER" ? user.id : user.role === "SELLER" ? user.ownerId : null;
  const taken = organizerId
    ? await codeUsedInTeam(organizerId, newCode, user.id)
    : await (async () => {
        const others = await prisma.adminUser.findMany({ where: { role: "SUPERADMIN", active: true, id: { not: user.id } }, select: { codeHash: true } });
        for (const o of others) if (await bcrypt.compare(newCode, o.codeHash)) return true;
        return false;
      })();
  if (taken) return NextResponse.json({ error: "Ese código no está disponible. Elige otro." }, { status: 409 });

  const current = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  const keep = current ? hashRefreshToken(current) : null;
  await prisma.$transaction([
    prisma.adminUser.update({ where: { id: user.id }, data: { codeHash: await bcrypt.hash(newCode, BCRYPT_ROUNDS) } }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null, ...(keep ? { tokenHash: { not: keep } } : {}) },
      data: { revokedAt: new Date() },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
