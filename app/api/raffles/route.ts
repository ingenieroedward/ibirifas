import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import type { CreateRaffleInput, RaffleSummaryDTO } from "@/lib/types";

const DEFAULT_TOTAL_NUMBERS = 100;

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
  .nullable()
  .optional();

const MAX_ACCOUNTS = 5;

const accountSchema = z.object({
  label: z.string().trim().min(1).max(40),
  number: z.string().trim().min(1).max(60),
  holderName: z.string().trim().max(80).nullable().optional(),
});

const createRaffleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  prizeLabel: z.string().trim().max(120).nullable().optional(),
  lottery: z.string().trim().max(80).nullable().optional(),
  numberPrice: z.number().int().positive(),
  totalNumbers: z.number().int().min(10).max(1000).optional(),
  drawDate: z.string().datetime().nullable().optional(),
  themeBackground: hexColorSchema,
  themeNumberColor: hexColorSchema,
  themeTextColor: hexColorSchema,
  accounts: z.array(accountSchema).max(MAX_ACCOUNTS).optional(),
});

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (user.role === "SUPERADMIN") {
    return NextResponse.json([] satisfies RaffleSummaryDTO[]);
  }

  const tenantId = tenantIdFor(user);
  if (!tenantId) {
    return NextResponse.json([] satisfies RaffleSummaryDTO[]);
  }

  const raffles = await prisma.raffle.findMany({
    where: { ownerId: tenantId },
    orderBy: { createdAt: "desc" },
  });

  const raffleIds = raffles.map((r) => r.id);
  const grouped = raffleIds.length
    ? await prisma.raffleNumber.groupBy({
        by: ["raffleId", "status"],
        where: { raffleId: { in: raffleIds } },
        _count: true,
      })
    : [];

  const countsByRaffle = new Map<string, { available: number; occupied: number; paid: number }>();
  for (const row of grouped) {
    const bucket = countsByRaffle.get(row.raffleId) ?? { available: 0, occupied: 0, paid: 0 };
    if (row.status === "available") bucket.available = row._count;
    else if (row.status === "occupied") bucket.occupied = row._count;
    else if (row.status === "paid") bucket.paid = row._count;
    countsByRaffle.set(row.raffleId, bucket);
  }

  const dtos: RaffleSummaryDTO[] = raffles.map((r) => {
    const counts = countsByRaffle.get(r.id) ?? { available: 0, occupied: 0, paid: 0 };
    return {
      id: r.id,
      name: r.name,
      prizeLabel: r.prizeLabel,
      lottery: r.lottery,
      numberPrice: r.numberPrice,
      totalNumbers: r.totalNumbers,
      drawDate: r.drawDate ? r.drawDate.toISOString() : null,
      status: r.status as "active" | "closed",
      availableCount: counts.available,
      occupiedCount: counts.occupied,
      paidCount: counts.paid,
      themeBackground: r.themeBackground,
      themeNumberColor: r.themeNumberColor,
      themeTextColor: r.themeTextColor,
    };
  });

  return NextResponse.json(dtos);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = createRaffleSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const input: CreateRaffleInput = parsed.data;
  const totalNumbers = input.totalNumbers ?? DEFAULT_TOTAL_NUMBERS;

  const raffle = await prisma.$transaction(async (tx) => {
    const created = await tx.raffle.create({
      data: {
        ownerId: user.id,
        name: input.name,
        prizeLabel: input.prizeLabel ?? null,
        lottery: input.lottery ?? null,
        numberPrice: input.numberPrice,
        totalNumbers,
        drawDate: input.drawDate ? new Date(input.drawDate) : null,
        status: "active",
        themeBackground: input.themeBackground ?? null,
        themeNumberColor: input.themeNumberColor ?? null,
        themeTextColor: input.themeTextColor ?? null,
      },
    });

    await tx.raffleNumber.createMany({
      data: Array.from({ length: totalNumbers }, (_, value) => ({
        raffleId: created.id,
        value,
        status: "available",
      })),
    });

    if (input.accounts && input.accounts.length > 0) {
      await tx.raffleAccount.createMany({
        data: input.accounts.map((account, position) => ({
          raffleId: created.id,
          label: account.label,
          number: account.number,
          holderName: account.holderName || null,
          position,
        })),
      });
    }

    return created;
  });

  const dto: RaffleSummaryDTO = {
    id: raffle.id,
    name: raffle.name,
    prizeLabel: raffle.prizeLabel,
    lottery: raffle.lottery,
    numberPrice: raffle.numberPrice,
    totalNumbers: raffle.totalNumbers,
    drawDate: raffle.drawDate ? raffle.drawDate.toISOString() : null,
    status: raffle.status as "active" | "closed",
    availableCount: totalNumbers,
    occupiedCount: 0,
    paidCount: 0,
    themeBackground: raffle.themeBackground,
    themeNumberColor: raffle.themeNumberColor,
    themeTextColor: raffle.themeTextColor,
  };

  return NextResponse.json(dto, { status: 201 });
}
