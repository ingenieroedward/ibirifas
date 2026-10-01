import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";
import type { MeDTO } from "@/lib/types";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const dto: MeDTO = { id: user.id, name: user.name, role: user.role, plan: user.plan, orgCode: user.orgCode };
  return NextResponse.json(dto);
}

const updateSchema = z.object({ name: z.string().trim().min(2).max(80) });

/** Anyone signed in changes their own display name (what the team sees: header, "vendido por", notices). */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody(req, BODY_LIMITS.small);
  if (!body.ok) return body.response;
  const parsed = updateSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Escribe un nombre de 2 a 80 caracteres." }, { status: 400 });

  const row = await prisma.adminUser.update({ where: { id: user.id }, data: { name: parsed.data.name }, select: { name: true } });
  const dto: MeDTO = { id: user.id, name: row.name, role: user.role, plan: user.plan, orgCode: user.orgCode };
  return NextResponse.json(dto);
}
