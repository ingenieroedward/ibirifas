import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import type {
  NumberStatus,
  PaymentMethod,
  PaymentStatus,
  RaffleDTO,
  RaffleNumberDTO,
} from "@/lib/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const raffle = await prisma.raffle.findUnique({
    where: { id },
    include: { numbers: { orderBy: { value: "asc" } } },
  });

  if (!raffle) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  const tenantId = tenantIdFor(user);
  if (!tenantId || raffle.ownerId !== tenantId) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  const numbers: RaffleNumberDTO[] = raffle.numbers.map((n) => ({
    id: n.id,
    value: n.value,
    status: n.status as NumberStatus,
    buyerName: n.buyerName,
    buyerPhone: n.buyerPhone,
    photoDataUrl: n.photoDataUrl,
    paymentStatus: n.paymentStatus as PaymentStatus,
    paymentMethod: n.paymentMethod as PaymentMethod | null,
    notes: n.notes,
    updatedAt: n.updatedAt.toISOString(),
  }));

  const dto: RaffleDTO = {
    id: raffle.id,
    name: raffle.name,
    prizeLabel: raffle.prizeLabel,
    numberPrice: raffle.numberPrice,
    totalNumbers: raffle.totalNumbers,
    drawDate: raffle.drawDate ? raffle.drawDate.toISOString() : null,
    status: raffle.status as "active" | "closed",
    numbers,
  };

  return NextResponse.json(dto);
}
