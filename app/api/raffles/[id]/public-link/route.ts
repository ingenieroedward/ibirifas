import { activationBlock } from "@/lib/billing";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { newPublicToken } from "@/lib/publicRaffle";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";

const bodySchema = z.object({ action: z.enum(["enable", "disable", "regenerate"]) });

/**
 * Turn a raffle's public link on, off, or replace it with a new one (the old
 * link stops working at once). Organizer only.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "ORGANIZER") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const raffle = await prisma.raffle.findUnique({ where: { id }, select: { ownerId: true, publicToken: true } });
  const tenantId = tenantIdFor(user);
  if (!raffle || !tenantId || raffle.ownerId !== tenantId) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  const rawBodyBody = await readJsonBody(req, BODY_LIMITS.small);
  if (!rawBodyBody.ok) return rawBodyBody.response;
  const rawBody: unknown = rawBodyBody.value;
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { action } = parsed.data;
  // Sharing the raffle is how it starts selling: only once it is active.
  if (action !== "disable") {
    const blocked = await activationBlock(id);
    if (blocked) return blocked;
  }
  let publicToken: string | null;
  if (action === "disable") publicToken = null;
  else if (action === "enable") publicToken = raffle.publicToken ?? newPublicToken();
  else publicToken = newPublicToken();

  if (publicToken !== raffle.publicToken) {
    await prisma.raffle.update({ where: { id }, data: { publicToken } });
  }
  return NextResponse.json({ publicToken });
}
