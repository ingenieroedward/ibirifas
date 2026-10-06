import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import type { PackRequestDTO } from "@/lib/types";

/**
 * Packs paid by transfer (lib/billing.ts), for the superadmin: every one waiting for review (with its receipt),
 * then the last 50 reviewed. `?summary=1`: only how many are waiting.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "SUPERADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (req.nextUrl.searchParams.get("summary") === "1") {
    return NextResponse.json({ pending: await prisma.packRequest.count({ where: { status: "pending" } }) });
  }

  const [pending, reviewed] = await Promise.all([
    prisma.packRequest.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" } }),
    prisma.packRequest.findMany({
      where: { status: { not: "pending" } },
      orderBy: { reviewedAt: "desc" },
      take: 50,
      omit: { receiptDataUrl: true },
    }),
  ]);
  const rows = [...pending, ...reviewed];
  const [owners, raffles] = await Promise.all([
    prisma.adminUser.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.ownerId))] } }, select: { id: true, name: true, orgCode: true } }),
    prisma.raffle.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.raffleId).filter((v): v is string => Boolean(v)))] } },
      select: { id: true, name: true },
    }),
  ]);
  const ownerName = new Map(owners.map((o) => [o.id, o.orgCode ? `${o.name} (${o.orgCode})` : o.name]));
  const raffleName = new Map(raffles.map((r) => [r.id, r.name]));
  const out: PackRequestDTO[] = rows.map((r) => ({
    id: r.id,
    organization: ownerName.get(r.ownerId) ?? "Organización eliminada",
    raffleName: r.raffleId ? (raffleName.get(r.raffleId) ?? null) : null,
    raffles: r.raffles,
    amount: r.amount,
    payerName: r.payerName,
    status: r.status as PackRequestDTO["status"],
    rejectReason: r.rejectReason,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewedByName: r.reviewedByName,
    createdAt: r.createdAt.toISOString(),
    receiptDataUrl: "receiptDataUrl" in r ? (r.receiptDataUrl as string) : null,
  }));
  return NextResponse.json(out);
}
