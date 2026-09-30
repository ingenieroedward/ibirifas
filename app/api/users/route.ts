import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isValidLoginCode } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { isValidOrgCode, normalizeOrgCode, ORG_CODE_HELP } from "@/lib/orgCode";
import { codeUsedInTeam, orgCodeTaken, uniqueOrgCodeFromName } from "@/lib/team";
import type { ManagedUserDTO, Role } from "@/lib/types";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";

const BCRYPT_ROUNDS = 10;

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string(),
  orgCode: z.string().max(60).optional(),
});

function toManagedUserDTO(
  user: { id: string; name: string; role: string; active: boolean; plan: string; orgCode: string | null; createdAt: Date },
  /** Sellers have no code of their own; they log in under their organizer's. */
  inheritedOrgCode: string | null = null,
): ManagedUserDTO {
  return {
    id: user.id,
    name: user.name,
    role: user.role as Role,
    active: user.active,
    plan: user.plan,
    orgCode: user.orgCode ?? inheritedOrgCode,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (user.role === "SUPERADMIN") {
    const organizers = await prisma.adminUser.findMany({
      where: { role: "ORGANIZER" },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(organizers.map((organizer) => toManagedUserDTO(organizer)));
  }

  if (user.role === "ORGANIZER") {
    const sellers = await prisma.adminUser.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(sellers.map((seller) => toManagedUserDTO(seller, user.orgCode)));
  }

  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (user.role === "SELLER") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const rawBodyBody = await readJsonBody(req, BODY_LIMITS.small);
  if (!rawBodyBody.ok) return rawBodyBody.response;
  const rawBody: unknown = rawBodyBody.value;

  const parsed = createUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { name, code } = parsed.data;

  if (!isValidLoginCode(code)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);

  if (user.role === "SUPERADMIN") {
    // A new organization: pick its code (or derive one from the name). The
    // 6-digit code needs no collision check, nobody else is in this team yet.
    const requested = parsed.data.orgCode !== undefined ? normalizeOrgCode(parsed.data.orgCode) : "";
    if (requested !== "" && !isValidOrgCode(requested)) {
      return NextResponse.json({ error: `Código de organización inválido. ${ORG_CODE_HELP}` }, { status: 400 });
    }
    if (requested !== "" && (await orgCodeTaken(requested))) {
      return NextResponse.json({ error: "Ese código de organización ya existe, elige otro" }, { status: 409 });
    }
    const orgCode = requested !== "" ? requested : await uniqueOrgCodeFromName(name);

    const created = await prisma.adminUser.create({
      data: { name, codeHash, role: "ORGANIZER", ownerId: null, plan: "free", active: true, orgCode },
    });
    return NextResponse.json(toManagedUserDTO(created), { status: 201 });
  }

  // A seller joins the organizer's team: the code only has to differ from the
  // people already on it (someone in another organization may use the same one).
  if (await codeUsedInTeam(user.id, code)) {
    return NextResponse.json({ error: "Ese código ya está en uso en tu equipo, elige otro" }, { status: 409 });
  }
  const created = await prisma.adminUser.create({
    data: { name, codeHash, role: "SELLER", ownerId: user.id, active: true },
  });
  return NextResponse.json(toManagedUserDTO(created, user.orgCode), { status: 201 });
}
