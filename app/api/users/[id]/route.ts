import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isValidLoginCode } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { isValidOrgCode, normalizeOrgCode, ORG_CODE_HELP } from "@/lib/orgCode";
import { codeUsedInTeam, orgCodeTaken } from "@/lib/team";
import type { ManagedUserDTO, Role } from "@/lib/types";

const BCRYPT_ROUNDS = 10;

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  orgCode: z.string().max(60).optional(),
  active: z.boolean().optional(),
  code: z.string().optional(),
  plan: z.string().trim().min(1).max(40).optional(),
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (user.role === "SELLER") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;

  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Authorization: SUPERADMIN only touches ORGANIZER accounts, ORGANIZER only
  // touches their own SELLERs. Anything else is reported as not-found so we
  // don't leak the existence of other tenants' accounts.
  if (user.role === "SUPERADMIN") {
    if (target.role !== "ORGANIZER") {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
  } else {
    if (target.ownerId !== user.id) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = updateUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const input = parsed.data;
  const data: { name?: string; orgCode?: string; active?: boolean; codeHash?: string; plan?: string } = {};

  if (input.name !== undefined) {
    data.name = input.name;
  }

  if (input.plan !== undefined) {
    if (user.role !== "SUPERADMIN" || target.role !== "ORGANIZER") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    data.plan = input.plan;
  }

  if (input.orgCode !== undefined) {
    // Renaming an organization is the platform owner's call, and only makes sense on an organizer.
    if (user.role !== "SUPERADMIN" || target.role !== "ORGANIZER") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const orgCode = normalizeOrgCode(input.orgCode);
    if (!isValidOrgCode(orgCode)) {
      return NextResponse.json({ error: `Código de organización inválido. ${ORG_CODE_HELP}` }, { status: 400 });
    }
    if (await orgCodeTaken(orgCode, target.id)) {
      return NextResponse.json({ error: "Ese código de organización ya existe, elige otro" }, { status: 409 });
    }
    data.orgCode = orgCode;
  }

  if (input.code !== undefined) {
    if (!isValidLoginCode(input.code)) {
      return NextResponse.json({ error: "Código inválido" }, { status: 400 });
    }

    // Only the person's own team matters: the same code may exist in another organization.
    const organizerId = target.role === "ORGANIZER" ? target.id : target.ownerId;
    if (organizerId && (await codeUsedInTeam(organizerId, input.code, target.id))) {
      return NextResponse.json({ error: "Ese código ya está en uso en el equipo, elige otro" }, { status: 409 });
    }

    data.codeHash = await bcrypt.hash(input.code, BCRYPT_ROUNDS);
  }

  if (input.active !== undefined) {
    data.active = input.active;
  }

  const [updated] = await prisma.$transaction([
    prisma.adminUser.update({ where: { id: target.id }, data }),
    // A new code is usually a reset (lost phone, someone who shouldn't have it):
    // end the sessions opened with the old one instead of letting them live on.
    ...(data.codeHash
      ? [prisma.refreshToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } })]
      : []),
  ]);

  return NextResponse.json(toManagedUserDTO(updated, user.orgCode));
}
