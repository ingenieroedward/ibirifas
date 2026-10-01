import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { BANK_LABEL, candidatesFor, openReservations, pagoradarTenantId, toCandidateDTO } from "@/lib/pagoradar";
import type { ReceivedPaymentDTO, ReceivedPaymentStatus, ReceivedPaymentsDTO } from "@/lib/types";

const FILTERS: Record<string, ReceivedPaymentStatus[]> = {
  pending: ["review", "unmatched"],
  approved: ["auto", "approved"],
  ignored: ["ignored"],
};


/**
 * The payments the bank reported for the signed-in user's organization: `?filter=pending|approved|ignored`
 * (default pending), or `?count=1` for just the number waiting (the badge). Whole team: approving a payment
 * is the same as marking numbers paid, which every seller can do.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const tenantId = tenantIdFor(user);
  if (!tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const enabled = (await pagoradarTenantId()) === tenantId;
  const pending = enabled ? await prisma.receivedPayment.count({ where: { ownerId: tenantId, status: { in: FILTERS.pending } } }) : 0;
  if (req.nextUrl.searchParams.get("count")) return NextResponse.json({ enabled, pending });

  const owner = await prisma.adminUser.findUnique({ where: { id: tenantId }, select: { autoApprovePayments: true } });
  const filter = FILTERS[req.nextUrl.searchParams.get("filter") ?? "pending"] ?? FILTERS.pending;
  const rows = await prisma.receivedPayment.findMany({
    where: { ownerId: tenantId, status: { in: filter } },
    orderBy: { paidAt: "desc" },
    take: 100,
  });
  const resolverIds = [...new Set(rows.map((r) => r.resolvedById).filter((id): id is string => id !== null))];
  const resolvers = resolverIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: resolverIds } }, select: { id: true, name: true } })
    : [];
  const reservations = rows.some((r) => r.status === "review" || r.status === "unmatched") ? await openReservations(tenantId) : [];

  const payments: ReceivedPaymentDTO[] = rows.map((r) => ({
    id: r.id,
    bank: r.bank,
    bankLabel: BANK_LABEL[r.bank] ?? r.bank,
    method: r.method,
    amount: r.amount,
    payerName: r.payerName,
    payerBank: r.payerBank,
    reference: r.reference,
    paidAt: r.paidAt.toISOString(),
    status: r.status as ReceivedPaymentStatus,
    raffleId: r.raffleId,
    matchLabel: r.matchLabel,
    note: r.note,
    resolvedByName: resolvers.find((u) => u.id === r.resolvedById)?.name ?? null,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    candidates:
      r.status === "review" || r.status === "unmatched"
        ? candidatesFor(r, reservations)
            .slice(0, 5)
            .map((c) => toCandidateDTO(c.reservation, c.name))
        : [],
  }));
  const body: ReceivedPaymentsDTO = { enabled, autoApprove: owner?.autoApprovePayments ?? true, pending, payments };
  return NextResponse.json(body);
}
