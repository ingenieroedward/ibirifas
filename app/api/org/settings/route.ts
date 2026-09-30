import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import type { OrgSettingsDTO } from "@/lib/types";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";

const updateSchema = z.object({ publicReservations: z.boolean().optional() });

/** The organization's own settings: only its organizer reads or changes them. */
async function organizerOnly(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (user.role !== "ORGANIZER") return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  return { user };
}

export async function GET(req: NextRequest) {
  const auth = await organizerOnly(req);
  if (auth.error) return auth.error;
  const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: auth.user.id }, select: { publicReservations: true } });
  return NextResponse.json({ publicReservations: row.publicReservations } satisfies OrgSettingsDTO);
}

export async function PATCH(req: NextRequest) {
  const auth = await organizerOnly(req);
  if (auth.error) return auth.error;

  const rawBody = await readJsonBody(req, BODY_LIMITS.small);
  if (!rawBody.ok) return rawBody.response;
  const raw: unknown = rawBody.value;
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const row = await prisma.adminUser.update({
    where: { id: auth.user.id },
    data: { ...(parsed.data.publicReservations !== undefined ? { publicReservations: parsed.data.publicReservations } : {}) },
    select: { publicReservations: true },
  });
  return NextResponse.json({ publicReservations: row.publicReservations } satisfies OrgSettingsDTO);
}
