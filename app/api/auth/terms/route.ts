import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import type { MeDTO } from "@/lib/types";

/** An organizer accepts the current terms of use (/terminos); the moment is kept as their acceptance. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "ORGANIZER") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  await prisma.adminUser.update({ where: { id: user.id }, data: { termsAcceptedAt: new Date() } });
  const dto: MeDTO = { id: user.id, name: user.name, role: user.role, plan: user.plan, orgCode: user.orgCode, needsTerms: false };
  return NextResponse.json(dto);
}
