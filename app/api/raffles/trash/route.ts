import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { purgeDate } from "@/lib/trash";
import type { TrashedRaffleDTO } from "@/lib/types";

/** The organization's trash: raffles deleted in the last TRASH_DAYS, newest first, with who deleted them. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const tenantId = tenantIdFor(user);
  if (!tenantId || user.role !== "ORGANIZER") return NextResponse.json([] satisfies TrashedRaffleDTO[]);
  const raffles = await prisma.raffle.findMany({
    where: { ownerId: tenantId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: { id: true, name: true, deletedAt: true, deletedByName: true, winnerValue: true },
  });
  return NextResponse.json(
    raffles.map((r) => ({
      id: r.id,
      name: r.name,
      deletedAt: r.deletedAt!.toISOString(),
      deletedByName: r.deletedByName,
      purgeAt: purgeDate(r.deletedAt!).toISOString(),
      winnerValue: r.winnerValue,
    })) satisfies TrashedRaffleDTO[],
  );
}
