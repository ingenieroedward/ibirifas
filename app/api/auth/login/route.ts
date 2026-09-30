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
import { checkLoginRateLimit, getClientIp, isOrgLoginLocked, recordOrgLoginFailure } from "@/lib/rateLimit";
import { isValidOrgCode, normalizeOrgCode } from "@/lib/orgCode";
import type { MeDTO, Role } from "@/lib/types";
import type { AdminUser } from "@prisma/client";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";

// A valid bcrypt hash of a throwaway string, only used to spend equal time.
const DUMMY_HASH = "$2b$10$vkDrIDdD6LbjAmMKy2KMleMnOq5l0lR197e./.s1QbzT8mKEqOnEC";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkLoginRateLimit(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta de nuevo más tarde." },
      { status: 429 },
    );
  }

  const bodyBody = await readJsonBody(req, BODY_LIMITS.small);
  if (!bodyBody.ok) return bodyBody.response;
  const body: unknown = bodyBody.value;

  const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const code = fields.code;
  const rawOrgCode = fields.orgCode;

  if (typeof code !== "string" || !isValidLoginCode(code)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }
  if (rawOrgCode !== undefined && rawOrgCode !== null && typeof rawOrgCode !== "string") {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  // The organization code says whose team to look in, so the 6-digit code is
  // only compared against that team (a handful of people) instead of everyone.
  // No organization code means the platform owner.
  const orgCode = normalizeOrgCode(rawOrgCode ?? "");
  // Too many failed guesses against this organization from anywhere: wait it out (see lib/rateLimit.ts).
  if (isOrgLoginLocked(orgCode)) {
    return NextResponse.json(
      { error: "Demasiados intentos para esta organización. Intenta de nuevo en unos minutos." },
      { status: 429 },
    );
  }
  let candidates: AdminUser[] = [];
  if (orgCode === "") {
    candidates = await prisma.adminUser.findMany({ where: { role: "SUPERADMIN", active: true } });
  } else if (isValidOrgCode(orgCode)) {
    const organizer = await prisma.adminUser.findUnique({ where: { orgCode } });
    // A suspended organizer suspends their whole team.
    if (organizer && organizer.role === "ORGANIZER" && organizer.active) {
      candidates = await prisma.adminUser.findMany({
        where: { active: true, OR: [{ id: organizer.id }, { ownerId: organizer.id }] },
      });
    }
  }

  let matchedUser: AdminUser | null = null;
  for (const user of candidates) {
    if (await bcrypt.compare(code, user.codeHash)) {
      matchedUser = user;
      break;
    }
  }
  if (candidates.length === 0) {
    // An unknown organization must cost the same time as a wrong code, so
    // response timing doesn't reveal which organization codes exist.
    await bcrypt.compare(code, DUMMY_HASH);
  }

  if (!matchedUser) {
    recordOrgLoginFailure(orgCode);
    // Same answer whether the organization or the code was wrong.
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

  const user: MeDTO = {
    id: matchedUser.id,
    name: matchedUser.name,
    role: matchedUser.role as Role,
    plan: matchedUser.plan,
    orgCode: matchedUser.orgCode ?? (matchedUser.ownerId ? orgCode : null),
  };

  const res = NextResponse.json({ user });
  setAuthCookies(res, { accessToken, refreshToken });
  return res;
}
