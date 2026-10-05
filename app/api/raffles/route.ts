import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { MAX_GROUPS } from "@/lib/groups";
import { settingToDb } from "@/lib/reservations";
import { MAX_STAGES, stageInputSchema } from "@/lib/stageSchema";
import { accountInputSchema, accountRows } from "@/lib/accounts";
import type { CreateRaffleInput, DrawTrigger, RaffleSummaryDTO } from "@/lib/types";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";
import { billingEnabled, raffleActive } from "@/lib/billing";

const DEFAULT_TOTAL_NUMBERS = 100;

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
  .nullable()
  .optional();

const MAX_ACCOUNTS = 5;


const groupSchema = z.object({
  label: z.string().regex(/^[A-Z]$/, "Etiqueta inválida"),
  price: z.number().int().positive().max(1_000_000_000),
  values: z.array(z.number().int().min(0)).min(1).max(1000),
});

const createRaffleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  prizeLabel: z.string().trim().max(120).nullable().optional(),
  permit: z.string().trim().max(120).nullable().optional(),
  lottery: z.string().trim().max(80).nullable().optional(),
  numberPrice: z.number().int().positive(),
  totalNumbers: z.number().int().min(10).max(1000).optional(),
  drawDate: z.string().datetime().nullable().optional(),
  drawTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida").nullable().optional(),
  drawTrigger: z.enum(["date", "sold", "paid"]).optional(),
  themeBackground: hexColorSchema,
  themeNumberColor: hexColorSchema,
  themeTextColor: hexColorSchema,
  accounts: z.array(accountInputSchema).max(MAX_ACCOUNTS).optional(),
  groups: z.array(groupSchema).max(MAX_GROUPS).optional(),
  holdDays: z.number().int().min(1).max(365).nullable().optional(),
  autoRelease: z.boolean().optional(),
  publicReservations: z.enum(["inherit", "on", "off"]).optional(),
  stages: z.array(stageInputSchema).min(2).max(MAX_STAGES).optional(),
  stageDeadlineDays: z.number().int().min(0).max(30).optional(),
  fullPayPerk: z.enum(["none", "discount", "draw"]).optional(),
  fullPayDiscount: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  bonusStage: stageInputSchema.nullable().optional(),
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
    include: { owner: { select: { billingExempt: true } } },
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
      drawTrigger: r.drawTrigger as DrawTrigger,
      status: r.status as "active" | "closed",
      winnerValue: r.status === "closed" ? r.winnerValue : null,
      availableCount: counts.available,
      occupiedCount: counts.occupied,
      paidCount: counts.paid,
      groupCount: groupsByRaffle.get(r.id) ?? 0,
      collected:
        (counts.paid - (groupedPaidCount.get(r.id) ?? 0)) * r.numberPrice + (groupedCollected.get(r.id) ?? 0),
      themeBackground: r.themeBackground,
      themeNumberColor: r.themeNumberColor,
      themeTextColor: r.themeTextColor,
      active: raffleActive(r, r.owner),
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
  if (user.needsTerms) {
    return NextResponse.json({ error: "Acepta los términos de uso antes de crear una rifa." }, { status: 403 });
  }

  const rawBodyBody = await readJsonBody(req, BODY_LIMITS.medium);
  if (!rawBodyBody.ok) return rawBodyBody.response;
  const rawBody: unknown = rawBodyBody.value;

  const parsed = createRaffleSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const input: CreateRaffleInput = parsed.data;
  const totalNumbers = input.totalNumbers ?? DEFAULT_TOTAL_NUMBERS;
  const groups = input.groups ?? [];

  // A raffle by stages: every stage needs its installment, sets can't be combined with it, and the number's
  // price is the sum of the installments.
  const stages = input.stages ?? [];
  const byStages = stages.length > 0;
  if (byStages) {
    if (groups.length > 0) {
      return NextResponse.json({ error: "Una rifa por etapas no puede venderse por conjuntos." }, { status: 400 });
    }
    if (stages.some((s) => !s.price)) {
      return NextResponse.json({ error: "Cada etapa necesita el valor de su cuota." }, { status: 400 });
    }
  }
  const stagesTotal = stages.reduce((sum, s) => sum + (s.price ?? 0), 0);
  const perk = byStages ? (input.fullPayPerk ?? "none") : "none";
  if (perk === "discount" && !(input.fullPayDiscount && input.fullPayDiscount > 0 && input.fullPayDiscount < stagesTotal)) {
    return NextResponse.json({ error: "El descuento por pagar todo debe ser mayor a cero y menor que el total." }, { status: 400 });
  }
  if (perk === "draw" && !input.bonusStage?.prize) {
    return NextResponse.json({ error: "Escribe el premio del sorteo extra por pagar todo." }, { status: 400 });
  }
  const lastStageDate = [...stages].reverse().find((s) => s.drawDate)?.drawDate ?? null;

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

  const owner = await prisma.adminUser.findUniqueOrThrow({ where: { id: user.id }, select: { billingExempt: true } });
  const raffle = await prisma.$transaction(async (tx) => {
    const created = await tx.raffle.create({
      data: {
        ownerId: user.id,
        name: input.name,
        prizeLabel: input.prizeLabel ?? null,
        permit: input.permit || null,
        lottery: input.lottery ?? null,
        numberPrice: byStages ? stagesTotal : input.numberPrice,
        totalNumbers,
        drawDate: byStages ? (lastStageDate ? new Date(lastStageDate) : null) : input.drawDate ? new Date(input.drawDate) : null,
        drawTime: input.drawTime || null,
        drawTrigger: byStages ? "date" : (input.drawTrigger ?? "date"),
        stageDeadlineDays: input.stageDeadlineDays ?? 3,
        fullPayPerk: perk,
        fullPayDiscount: perk === "discount" ? input.fullPayDiscount! : null,
        status: "active",
        themeBackground: input.themeBackground ?? null,
        themeNumberColor: input.themeNumberColor ?? null,
        themeTextColor: input.themeTextColor ?? null,
        holdDays: input.holdDays ?? null,
        // Releasing on its own only makes sense with a deadline.
        autoRelease: input.holdDays || byStages ? (input.autoRelease ?? false) : false,
        publicReservations: settingToDb(input.publicReservations ?? "inherit"),
        // Exempt organizations (and a server without billing) sell right away; the activation is kept so the
        // raffle keeps selling if that changes later.
        ...(owner.billingExempt || !billingEnabled()
          ? { activatedAt: new Date(), activationKind: owner.billingExempt ? "exempt" : "legacy" }
          : {}),
      },
    });

    if (byStages) {
      await tx.raffleStage.createMany({
        data: [
          ...stages.map((s, i) => ({
            raffleId: created.id,
            position: i + 1,
            label: s.label || `Etapa ${i + 1}`,
            prize: s.prize,
            price: s.price!,
            lottery: s.lottery || null,
            drawDate: s.drawDate ? new Date(s.drawDate) : null,
          })),
          ...(perk === "draw" && input.bonusStage
            ? [
                {
                  raffleId: created.id,
                  position: stages.length + 1,
                  label: input.bonusStage.label || "Sorteo extra",
                  prize: input.bonusStage.prize,
                  price: 0,
                  bonus: true,
                  lottery: input.bonusStage.lottery || null,
                  drawDate: input.bonusStage.drawDate ? new Date(input.bonusStage.drawDate) : null,
                },
              ]
            : []),
        ],
      });
    }

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
        data: accountRows(created.id, input.accounts),
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
    drawTrigger: raffle.drawTrigger as DrawTrigger,
    status: raffle.status as "active" | "closed",
    winnerValue: null,
    availableCount: totalNumbers,
    occupiedCount: 0,
    paidCount: 0,
    groupCount: groups.length,
    collected: 0,
    themeBackground: raffle.themeBackground,
    themeNumberColor: raffle.themeNumberColor,
    themeTextColor: raffle.themeTextColor,
    active: raffleActive(raffle, owner),
  };

  return NextResponse.json(dto, { status: 201 });
}
