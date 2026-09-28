import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/session";
import type {
  NumberStatus,
  PaymentStatus,
  RaffleDTO,
  RaffleNumberDTO,
} from "@/lib/types";

export async function GET(req: NextRequest) {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const raffle = await prisma.raffle.findFirst({
    where: { status: "active" },
    include: { numbers: { orderBy: { value: "asc" } } },
  });

  if (!raffle) {
    return NextResponse.json({ error: "No hay una rifa activa" }, { status: 404 });
  }

  const numbers: RaffleNumberDTO[] = raffle.numbers.map((n) => ({
    id: n.id,
    value: n.value,
    status: n.status as NumberStatus,
    buyerName: n.buyerName,
    buyerPhone: n.buyerPhone,
    photoDataUrl: n.photoDataUrl,
    paymentStatus: n.paymentStatus as PaymentStatus,
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
