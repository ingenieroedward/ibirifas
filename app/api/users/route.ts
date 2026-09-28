import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isValidLoginCode } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import type { ManagedUserDTO, Role } from "@/lib/types";

const BCRYPT_ROUNDS = 10;

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string(),
});

function toManagedUserDTO(user: {
  id: string;
  name: string;
  role: string;
  active: boolean;
  plan: string;
  createdAt: Date;
}): ManagedUserDTO {
  return {
    id: user.id,
    name: user.name,
    role: user.role as Role,
    active: user.active,
    plan: user.plan,
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
    return NextResponse.json(organizers.map(toManagedUserDTO));
  }

  if (user.role === "ORGANIZER") {
    const sellers = await prisma.adminUser.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(sellers.map(toManagedUserDTO));
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

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = createUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { name, code } = parsed.data;

  if (!isValidLoginCode(code)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  // Code-collision check: a login has no tenant context, so two active users
  // must never share a code across the whole system.
  const activeUsers = await prisma.adminUser.findMany({ where: { active: true } });
  for (const existing of activeUsers) {
    if (await bcrypt.compare(code, existing.codeHash)) {
      return NextResponse.json(
        { error: "Ese código ya está en uso, elige otro" },
        { status: 409 },
      );
    }
  }

  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);

  const created =
    user.role === "SUPERADMIN"
      ? await prisma.adminUser.create({
          data: { name, codeHash, role: "ORGANIZER", ownerId: null, plan: "free", active: true },
        })
      : await prisma.adminUser.create({
          data: { name, codeHash, role: "SELLER", ownerId: user.id, active: true },
        });

  return NextResponse.json(toManagedUserDTO(created), { status: 201 });
}
