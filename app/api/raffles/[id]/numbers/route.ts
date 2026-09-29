import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { toNumberDTO } from "@/lib/numberDto";

/**
 * Numbers changed after `since` (an ISO timestamp taken from the newest
 * `updatedAt` the caller already has). It's how a board catches up cheaply:
 * after a live signal, after reconnecting, and as a periodic safety net —
 * instead of re-downloading every number (and its photo).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const raffle = await prisma.raffle.findUnique({ where: { id }, select: { ownerId: true } });
  const tenantId = tenantIdFor(user);
  // 404 for missing and for someone else's raffle alike, so existence doesn't leak.
  if (!raffle || !tenantId || raffle.ownerId !== tenantId) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  const since = new Date(req.nextUrl.searchParams.get("since") ?? "");
  if (Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Parámetro 'since' inválido" }, { status: 400 });
  }

  const changed = await prisma.raffleNumber.findMany({
    where: { raffleId: id, updatedAt: { gt: since } },
    orderBy: { value: "asc" },
    include: { updatedBy: { select: { name: true } } },
  });

  return NextResponse.json({ numbers: changed.map(toNumberDTO) }, { headers: { "Cache-Control": "no-store" } });
}
