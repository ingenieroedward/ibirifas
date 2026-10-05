import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { notifyTeam } from "@/lib/push";
import { restoreRaffle } from "@/lib/trash";

/** The organizer brings a raffle back from the trash (closed, as it was deleted, with its public link). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "ORGANIZER") return NextResponse.json({ error: "Solo el organizador restaura rifas." }, { status: 403 });
  const { id } = await params;
  const tenantId = tenantIdFor(user);
  const raffle = await prisma.raffle.findUnique({ where: { id }, select: { ownerId: true, deletedAt: true } });
  if (!raffle || !raffle.deletedAt || !tenantId || raffle.ownerId !== tenantId) {
    return NextResponse.json({ error: "No está en la papelera." }, { status: 404 });
  }
  const restored = await restoreRaffle(id, { name: user.name });
  if (restored) {
    void notifyTeam(tenantId, user.id, { title: "Rifa restaurada", body: `${user.name} restauró «${restored.name}».`, url: `/rifas/${id}` });
  }
  return NextResponse.json({ ok: true });
}
