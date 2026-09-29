import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { MAX_GROUPS } from "@/lib/groups";
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

const groupSchema = z.object({
  label: z.string().regex(/^[A-Z]$/, "Etiqueta inválida"),
  price: z.number().int().positive().max(1_000_000_000),
  values: z.array(z.number().int().min(0)).min(1).max(1000),
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
  groups: z.array(groupSchema).max(MAX_GROUPS).optional(),
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

  // Money collected: loose paid numbers at the raffle's number price, numbers of
  // a set at that set's price (a set is paid whole, so price * paid / size).
  const groups = raffleIds.length
    ? await prisma.raffleGroup.findMany({ where: { raffleId: { in: raffleIds } }, select: { id: true, raffleId: true, price: true } })
    : [];
  const perGroup = groups.length
    ? await prisma.raffleNumber.groupBy({
        by: ["groupId", "status"],
        where: { groupId: { in: groups.map((g) => g.id) } },
        _count: true,
      })
    : [];
  const groupsByRaffle = new Map<string, number>();
  const groupedCollected = new Map<string, number>();
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const groupSize = new Map<string, number>();
  const groupPaid = new Map<string, number>();
  for (const g of groups) groupsByRaffle.set(g.raffleId, (groupsByRaffle.get(g.raffleId) ?? 0) + 1);
  for (const row of perGroup) {
    if (!row.groupId) continue;
    groupSize.set(row.groupId, (groupSize.get(row.groupId) ?? 0) + row._count);
    if (row.status === "paid") groupPaid.set(row.groupId, row._count);
  }
  for (const [groupId, paid] of groupPaid) {
    const g = groupById.get(groupId);
    if (!g) continue;
    const amount = Math.round((g.price * paid) / (groupSize.get(groupId) ?? paid));
    groupedCollected.set(g.raffleId, (groupedCollected.get(g.raffleId) ?? 0) + amount);
  }
  const groupedPaidCount = new Map<string, number>();
  for (const [groupId, paid] of groupPaid) {
    const g = groupById.get(groupId);
    if (g) groupedPaidCount.set(g.raffleId, (groupedPaidCount.get(g.raffleId) ?? 0) + paid);
  }

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
      groupCount: groupsByRaffle.get(r.id) ?? 0,
      collected:
        (counts.paid - (groupedPaidCount.get(r.id) ?? 0)) * r.numberPrice + (groupedCollected.get(r.id) ?? 0),
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
  const groups = input.groups ?? [];

  // Sets: each letter once, only numbers that exist, no number in two sets.
  const groupOf = new Map<number, string>();
  for (const [index, group] of groups.entries()) {
    if (groups.findIndex((g) => g.label === group.label) !== index) {
      return NextResponse.json({ error: `El conjunto ${group.label} está repetido` }, { status: 400 });
    }
    for (const value of group.values) {
      if (value >= totalNumbers) {
        return NextResponse.json({ error: `El número ${value} no existe en esta rifa` }, { status: 400 });
      }
      if (groupOf.has(value)) {
        return NextResponse.json(
          { error: `El número ${value} está en dos conjuntos (${groupOf.get(value)} y ${group.label})` },
          { status: 400 },
        );
      }
      groupOf.set(value, group.label);
    }
  }

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

    const groupIdByLabel = new Map<string, string>();
    for (const [position, group] of groups.entries()) {
      const row = await tx.raffleGroup.create({
        data: { raffleId: created.id, label: group.label, price: group.price, position },
      });
      groupIdByLabel.set(group.label, row.id);
    }

    await tx.raffleNumber.createMany({
      data: Array.from({ length: totalNumbers }, (_, value) => {
        const label = groupOf.get(value);
        return {
          raffleId: created.id,
          value,
          status: "available",
          groupId: label ? groupIdByLabel.get(label)! : null,
        };
      }),
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
    groupCount: groups.length,
    collected: 0,
    themeBackground: raffle.themeBackground,
    themeNumberColor: raffle.themeNumberColor,
    themeTextColor: raffle.themeTextColor,
  };

  return NextResponse.json(dto, { status: 201 });
}
