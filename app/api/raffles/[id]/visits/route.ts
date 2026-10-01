import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { visitStats } from "@/lib/visits";

/** How many people opened the raffle's public link (the whole team can see it). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const raffle = await prisma.raffle.findUnique({ where: { id }, select: { ownerId: true } });
  const tenantId = tenantIdFor(user);
  if (!raffle || !tenantId || raffle.ownerId !== tenantId) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }
  return NextResponse.json(await visitStats(id));
}
