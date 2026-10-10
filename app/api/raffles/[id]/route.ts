import { NextRequest, NextResponse } from "next/server";
import { BANK_LABEL } from "@/lib/pagoradar";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { numberInclude, toNumberDTO } from "@/lib/numberDto";
import { formatNumberValue } from "@/lib/format";
import { notifyTeam } from "@/lib/push";
import { emailDrawResult, mailOrigin } from "@/lib/buyerMail";
import { publishRaffleChange } from "@/lib/realtime";
import { sweepRaffle } from "@/lib/expiry";
import { reservationsOpen, settingFromDb, settingToDb } from "@/lib/reservations";
import type { BankPaymentDTO, DrawTrigger, FullPayPerk, RaffleAccountDTO, RaffleDTO, RaffleGroupDTO } from "@/lib/types";
import { stagesInclude, toStageDTO } from "@/lib/stageDto";
import { MAX_STAGES, stageInputSchema } from "@/lib/stageSchema";
import { syncCompletion } from "@/lib/completion";
import type { Prisma } from "@prisma/client";
import { raffleActive } from "@/lib/billing";
import { TRASH_DAYS, trashRaffle } from "@/lib/trash";
import { computeDraw, parseExtraPrizes, parsePrizeWins, prizeDigits, prizeKindLabel, supportsExtraPrizes } from "@/lib/prizes";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";
import { combosProblem, MAX_COMBO_COUNT, MAX_COMBOS, parseCombos } from "@/lib/combos";
import { accountInputSchema, accountRows, accountSelect, toAccountDTO } from "@/lib/accounts";

const MAX_ACCOUNTS = 5;

type RaffleWithNumbers = Prisma.RaffleGetPayload<{
  include: {
    numbers: {
      include: typeof numberInclude;
    };
    accounts: { select: { id: true; label: true; number: true; holderName: true; kind: true; keyType: true; hasQr: true; position: true } };
    groups: true;
    stages: true;
    owner: { select: { publicReservations: true, billingExempt: true } };
  };
}>;

/** Shared GET/PATCH response mapping — keep this the single source of truth for RaffleDTO shape. */
/** The bank payments (pagoradar) behind the raffle's paid numbers, for the team to see what paid each buyer. */
async function bankPaymentsOf(raffle: RaffleWithNumbers): Promise<Record<string, BankPaymentDTO>> {
  const refs = [...new Set(raffle.numbers.map((n) => n.paymentRef).filter((r): r is string => Boolean(r)))];
  if (refs.length === 0) return {};
  const rows = await prisma.receivedPayment.findMany({
    where: { id: { in: refs }, ownerId: raffle.ownerId },
    select: { id: true, bank: true, payerName: true, reference: true, amount: true, paidAt: true, status: true },
  });
  return Object.fromEntries(
    rows.map((p) => [
      p.id,
      { bank: BANK_LABEL[p.bank] ?? p.bank, payerName: p.payerName, reference: p.reference, amount: p.amount, paidAt: p.paidAt.toISOString(), auto: p.status === "auto" },
    ]),
  );
}

function toRaffleDTO(raffle: RaffleWithNumbers, bankPayments: Record<string, BankPaymentDTO> = {}): RaffleDTO {
  const numbers = raffle.numbers.map(toNumberDTO);

  const groups: RaffleGroupDTO[] = raffle.groups
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((g) => ({ id: g.id, label: g.label, price: g.price }));

  const accounts: RaffleAccountDTO[] = raffle.accounts
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(toAccountDTO);

  return {
    id: raffle.id,
    name: raffle.name,
    prizeLabel: raffle.prizeLabel,
    permit: raffle.permit,
    lottery: raffle.lottery,
    numberPrice: raffle.numberPrice,
    totalNumbers: raffle.totalNumbers,
    drawDate: raffle.drawDate ? raffle.drawDate.toISOString() : null,
    drawTime: raffle.drawTime,
    drawTrigger: raffle.drawTrigger as DrawTrigger,
    completedAt: raffle.completedAt ? raffle.completedAt.toISOString() : null,
    status: raffle.status as "active" | "closed",
    winnerValue: raffle.winnerValue,
    closedAt: raffle.closedAt ? raffle.closedAt.toISOString() : null,
    holdDays: raffle.holdDays,
    autoRelease: raffle.autoRelease,
    publicReservations: settingFromDb(raffle.publicReservations),
    reservationsOpen: reservationsOpen({
      raffleSetting: raffle.publicReservations,
      organizationDefault: raffle.owner.publicReservations,
      holdDays: raffle.holdDays,
      status: raffle.status,
    }),
    publicToken: raffle.publicToken,
    extraPrizes: parseExtraPrizes(raffle.extraPrizes),
    combos: parseCombos(raffle.combos),
    bankPayments,
    lotteryResult: raffle.lotteryResult,
    prizeResults: parsePrizeWins(raffle.prizeResults),
    active: raffleActive(raffle, raffle.owner),
    numbers,
    accounts,
    groups,
    stages: raffle.stages.slice().sort((a, b) => a.position - b.position).map(toStageDTO),
    stageDeadlineDays: raffle.stageDeadlineDays,
    fullPayPerk: (["none", "discount", "draw"].includes(raffle.fullPayPerk) ? raffle.fullPayPerk : "none") as FullPayPerk,
    fullPayDiscount: raffle.fullPayDiscount,
    themeBackground: raffle.themeBackground,
    themeNumberColor: raffle.themeNumberColor,
    themeTextColor: raffle.themeTextColor,
  };
}

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
  .nullable()
  .optional();


const extraPrizeSchema = z.object({
  kind: z.enum(["reverse", "first", "neighbors"]),
  prize: z.string().trim().min(1).max(80),
});

const updateRaffleSchema = z.object({
  status: z.enum(["active", "closed"]).optional(),
  winnerValue: z.number().int().min(0).nullable().optional(),
  // Closing with the lottery's result: the winner and every "Gana Más" prize come out of it (lib/prizes.ts).
  lotteryResult: z.string().trim().max(12).nullable().optional(),
  extraPrizes: z.array(extraPrizeSchema).max(3).optional(),
  combos: z.array(z.object({ count: z.number().int().min(2).max(MAX_COMBO_COUNT), price: z.number().int().positive() })).max(MAX_COMBOS).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  prizeLabel: z.string().trim().max(120).nullable().optional(),
  permit: z.string().trim().max(120).nullable().optional(),
  lottery: z.string().trim().max(80).nullable().optional(),
  numberPrice: z.number().int().positive().optional(),
  drawDate: z.string().datetime().nullable().optional(),
  drawTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida").nullable().optional(),
  drawTrigger: z.enum(["date", "sold", "paid"]).optional(),
  themeBackground: hexColorSchema,
  themeNumberColor: hexColorSchema,
  themeTextColor: hexColorSchema,
  accounts: z.array(accountInputSchema).max(MAX_ACCOUNTS).optional(),
  stages: z.array(stageInputSchema).max(MAX_STAGES + 1).optional(),
  stageDeadlineDays: z.number().int().min(0).max(30).optional(),
  fullPayPerk: z.enum(["none", "discount", "draw"]).optional(),
  fullPayDiscount: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  bonusStage: stageInputSchema.nullable().optional(),
  holdDays: z.number().int().min(1).max(365).nullable().optional(),
  autoRelease: z.boolean().optional(),
  publicReservations: z.enum(["inherit", "on", "off"]).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const load = () =>
    prisma.raffle.findUnique({
      where: { id },
      include: {
        numbers: {
          orderBy: { value: "asc" },
          include: numberInclude,
        },
        accounts: { select: { ...accountSelect, position: true } },
        groups: true,
        stages: stagesInclude,
        owner: { select: { publicReservations: true, billingExempt: true } },
      },
    });
  let raffle = await load();

  // A raffle in the trash is gone from everywhere until it is restored (lib/trash.ts).
  if (!raffle || raffle.deletedAt) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  const tenantId = tenantIdFor(user);
  if (!tenantId || raffle.ownerId !== tenantId) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  // Opening a raffle also applies its deadline for unpaid holds, so what is shown is never stale.
  if (raffle.status === "active" && (raffle.holdDays || raffle.stages.length > 0)) {
    const swept = await sweepRaffle(id);
    if (swept.released > 0) raffle = (await load()) ?? raffle;
  }

  return NextResponse.json(toRaffleDTO(raffle, await bankPaymentsOf(raffle)));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.raffle.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  const tenantId = tenantIdFor(user);
  if (!tenantId || existing.ownerId !== tenantId) {
    // 404, not 403: don't reveal that a raffle belonging to someone else exists.
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  const rawBodyBody = await readJsonBody(req, BODY_LIMITS.medium);
  if (!rawBodyBody.ok) return rawBodyBody.response;
  const rawBody: unknown = rawBodyBody.value;

  const parsed = updateRaffleSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const input = parsed.data;
  const data: Prisma.RaffleUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.prizeLabel !== undefined) data.prizeLabel = input.prizeLabel;
  if (input.permit !== undefined) data.permit = input.permit || null;
  if (input.lottery !== undefined) data.lottery = input.lottery;
  if (input.numberPrice !== undefined) data.numberPrice = input.numberPrice;
  if (input.drawDate !== undefined) {
    data.drawDate = input.drawDate ? new Date(input.drawDate) : null;
  }
  if (input.drawTime !== undefined) data.drawTime = input.drawTime || null;
  if (input.drawTrigger !== undefined) data.drawTrigger = input.drawTrigger;
  if (input.themeBackground !== undefined) data.themeBackground = input.themeBackground;
  if (input.themeNumberColor !== undefined) data.themeNumberColor = input.themeNumberColor;
  if (input.themeTextColor !== undefined) data.themeTextColor = input.themeTextColor;
  if (input.holdDays !== undefined) data.holdDays = input.holdDays;
  if (input.autoRelease !== undefined) data.autoRelease = input.autoRelease;
  if (input.publicReservations !== undefined) data.publicReservations = settingToDb(input.publicReservations);

  // Closing and reopening. Closing records the winner (or none) and the moment;
  // reopening forgets both. The winner can also be corrected while it's closed.
  const wasClosed = existing.status === "closed";
  const nextStatus = input.status ?? existing.status;
  if (nextStatus === "active") {
    if (input.winnerValue !== undefined && input.winnerValue !== null) {
      return NextResponse.json({ error: "Solo una rifa cerrada puede tener ganador" }, { status: 400 });
    }
    if (wasClosed) {
      data.status = "active";
      data.winnerValue = null;
      data.closedAt = null;
      data.lotteryResult = null;
      data.prizeResults = null;
    }
  } else {
    if (input.winnerValue !== undefined && input.winnerValue !== null && input.winnerValue >= existing.totalNumbers) {
      return NextResponse.json({ error: `El número ${input.winnerValue} no existe en esta rifa` }, { status: 400 });
    }
    const extras = parseExtraPrizes(existing.extraPrizes);
    let winnerValue = input.winnerValue;
    if (input.lotteryResult) {
      // The lottery's result decides the winner and every extra prize, from the numbers as they are now.
      const numbers = await prisma.raffleNumber.findMany({ where: { raffleId: id }, select: { value: true, status: true } });
      const statusByValue = new Map(numbers.map((n) => [n.value, n.status]));
      const draw = computeDraw(input.lotteryResult, existing.totalNumbers, input.prizeLabel ?? existing.prizeLabel, extras, (v) => statusByValue.get(v));
      if (!draw) {
        const digits = prizeDigits(existing.totalNumbers);
        return NextResponse.json(
          { error: digits ? `Escribe el resultado de la lotería con al menos ${digits} cifras.` : "Esta rifa no se cierra con el resultado de la lotería." },
          { status: 400 },
        );
      }
      winnerValue = draw.winnerValue;
      data.lotteryResult = input.lotteryResult.replace(/\D/g, "");
      data.prizeResults = JSON.stringify(draw.wins);
    } else if (winnerValue !== undefined && winnerValue !== null && extras.length > 0) {
      return NextResponse.json({ error: "Esta rifa tiene premios adicionales: escribe el resultado completo de la lotería." }, { status: 400 });
    } else if (winnerValue !== undefined) {
      // A winner typed by hand (or none): no lottery result behind it any more.
      data.lotteryResult = null;
      data.prizeResults = null;
    }
    if (!wasClosed) {
      data.status = "closed";
      data.closedAt = new Date();
      data.winnerValue = winnerValue ?? null;
    } else if (winnerValue !== undefined) {
      data.winnerValue = winnerValue;
    }
  }
  const justClosed = !wasClosed && nextStatus === "closed";

  // A raffle by stages: stages not yet played can get a new prize, name, lottery or date (installment prices
  // stay fixed once the raffle exists, since people may have paid them); the perk for paying up front can change.
  const existingStages = await prisma.raffleStage.findMany({ where: { raffleId: id }, orderBy: { position: "asc" } });
  const byStages = existingStages.length > 0;
  if (input.extraPrizes !== undefined) {
    if (input.extraPrizes.length > 0 && (byStages || !supportsExtraPrizes(existing.totalNumbers))) {
      return NextResponse.json({ error: "Los premios adicionales son para rifas de 10, 100 o 1.000 números, sin etapas." }, { status: 400 });
    }
    if (new Set(input.extraPrizes.map((p) => p.kind)).size !== input.extraPrizes.length) {
      return NextResponse.json({ error: "Cada premio adicional va una sola vez." }, { status: 400 });
    }
    data.extraPrizes = input.extraPrizes.length > 0 ? JSON.stringify(input.extraPrizes) : null;
  }
  // Combos: only for loose numbers (no sets, no stages), each cheaper than its numbers apart — checked again when
  // the number price changes, since a combo has to stay a deal.
  if (input.combos !== undefined || (input.numberPrice !== undefined && existing.combos)) {
    const combos = input.combos ?? parseCombos(existing.combos);
    if (combos.length > 0) {
      const hasGroups = (await prisma.raffleGroup.count({ where: { raffleId: id } })) > 0;
      if (byStages || hasGroups) {
        return NextResponse.json({ error: "Los combos son para rifas de números sueltos, sin letras ni etapas." }, { status: 400 });
      }
      const problem = combosProblem(combos, input.numberPrice ?? existing.numberPrice);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    if (input.combos !== undefined) data.combos = combos.length > 0 ? JSON.stringify([...combos].sort((a, b) => a.count - b.count)) : null;
  }
  if (!byStages && (input.stages || input.fullPayPerk || input.bonusStage)) {
    return NextResponse.json({ error: "Esta rifa no es por etapas." }, { status: 400 });
  }
  if (byStages) {
    // The price is the sum of the installments and each stage is played on its own date.
    delete data.numberPrice;
    delete data.drawTrigger;
  }
  const paidTotal = existingStages.filter((s) => !s.bonus).reduce((sum, s) => sum + s.price, 0);
  if (input.stageDeadlineDays !== undefined) data.stageDeadlineDays = input.stageDeadlineDays;
  const nextPerk = input.fullPayPerk ?? existing.fullPayPerk;
  if (input.fullPayPerk !== undefined) data.fullPayPerk = input.fullPayPerk;
  if (nextPerk === "discount") {
    const discount = input.fullPayDiscount !== undefined ? input.fullPayDiscount : existing.fullPayDiscount;
    if (!(discount && discount > 0 && discount < paidTotal)) {
      return NextResponse.json({ error: "El descuento por pagar todo debe ser mayor a cero y menor que el total." }, { status: 400 });
    }
    data.fullPayDiscount = discount;
  } else if (input.fullPayPerk !== undefined) {
    data.fullPayDiscount = null;
  }
  const existingBonus = existingStages.find((s) => s.bonus) ?? null;
  if (nextPerk === "draw" && !existingBonus && !input.bonusStage?.prize) {
    return NextResponse.json({ error: "Escribe el premio del sorteo extra por pagar todo." }, { status: 400 });
  }
  if (existingBonus?.outcome && input.fullPayPerk !== undefined && input.fullPayPerk !== "draw") {
    return NextResponse.json({ error: "El sorteo extra ya se jugó; no se puede quitar." }, { status: 409 });
  }
  for (const change of input.stages ?? []) {
    const stage = existingStages.find((s) => s.id === change.id);
    if (!stage) return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });
    if (stage.outcome) return NextResponse.json({ error: `${stage.label} ya se jugó: no se puede cambiar.` }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.raffle.update({ where: { id }, data });

    if (byStages) {
      for (const change of input.stages ?? []) {
        await tx.raffleStage.update({
          where: { id: change.id },
          data: {
            ...(change.label ? { label: change.label } : {}),
            prize: change.prize,
            ...(change.lottery !== undefined ? { lottery: change.lottery || null } : {}),
            ...(change.drawDate !== undefined ? { drawDate: change.drawDate ? new Date(change.drawDate) : null } : {}),
          },
        });
      }
      // The bonus draw follows the perk: created when it is switched on, removed (if not yet played) when off.
      if (nextPerk === "draw") {
        const bonusData = input.bonusStage
          ? {
              prize: input.bonusStage.prize,
              label: input.bonusStage.label || "Sorteo extra",
              lottery: input.bonusStage.lottery || null,
              drawDate: input.bonusStage.drawDate ? new Date(input.bonusStage.drawDate) : null,
            }
          : null;
        if (existingBonus && bonusData && !existingBonus.outcome) {
          await tx.raffleStage.update({ where: { id: existingBonus.id }, data: bonusData });
        } else if (!existingBonus && bonusData) {
          const last = existingStages[existingStages.length - 1]!;
          await tx.raffleStage.create({ data: { raffleId: id, position: last.position + 1, price: 0, bonus: true, ...bonusData } });
        }
      } else if (existingBonus && !existingBonus.outcome) {
        await tx.raffleStage.delete({ where: { id: existingBonus.id } });
      }
      // The raffle's own date is the last paid stage's, so lists and previews show when it ends.
      const fresh = await tx.raffleStage.findMany({ where: { raffleId: id, bonus: false }, orderBy: { position: "desc" } });
      const last = fresh.find((s) => s.drawDate);
      await tx.raffle.update({ where: { id }, data: { drawDate: last?.drawDate ?? null } });
    }

    // `accounts` follows the same "undefined vs provided" convention as the
    // other optional fields: absent means "leave untouched", present means
    // "this is the complete desired list" (full replace).
    if (input.accounts !== undefined) {
      // A QR image the organizer didn't change is carried over from the account it belonged to (`qrFrom`).
      const before = await tx.raffleAccount.findMany({ where: { raffleId: id }, select: { id: true, qrDataUrl: true } });
      await tx.raffleAccount.deleteMany({ where: { raffleId: id } });
      if (input.accounts.length > 0) {
        await tx.raffleAccount.createMany({ data: accountRows(id, input.accounts, before) });
      }
    }
  });

  // A changed trigger (or a reopened raffle) may make the raffle count as full right now, or not any more.
  if (input.drawTrigger !== undefined || (wasClosed && nextStatus === "active")) await syncCompletion(id);

  const updated = await prisma.raffle.findUniqueOrThrow({
    where: { id },
    include: {
      numbers: {
        orderBy: { value: "asc" },
        include: numberInclude,
      },
      accounts: { select: { ...accountSelect, position: true } },
      groups: true,
      stages: stagesInclude,
      owner: { select: { publicReservations: true, billingExempt: true } },
    },
  });

  // Every open board learns the raffle closed (or reopened) right away.
  if (justClosed || (wasClosed && nextStatus === "active")) publishRaffleChange(id);

  if (justClosed) {
    const winnerNumber =
      updated.winnerValue === null ? null : (updated.numbers.find((n) => n.value === updated.winnerValue) ?? null);
    const setLabel = winnerNumber?.groupId
      ? (updated.groups.find((g) => g.id === winnerNumber.groupId)?.label ?? null)
      : null;
    let body: string;
    if (updated.winnerValue === null) {
      body = `${user.name} cerró la rifa`;
    } else if (winnerNumber && winnerNumber.status !== "available") {
      const who = winnerNumber.buyerName ?? "un comprador";
      body = `Ganó el ${formatNumberValue(updated.winnerValue)}${setLabel ? ` (conjunto ${setLabel})` : ""}: ${who}`;
    } else {
      body = `Ganó el ${formatNumberValue(updated.winnerValue)}: nadie lo compró`;
    }
    const extraWon = parsePrizeWins(updated.prizeResults).filter((w) => w.kind !== "main" && w.won).length;
    if (extraWon > 0) body += ` · ${extraWon} ${extraWon === 1 ? "premio adicional" : "premios adicionales"} más`;
    void notifyTeam(tenantId, user.id, { title: `${updated.name} · rifa cerrada`, body, url: `/rifas/${id}` });
    // The buyers hear the result by email: "¡Ganaste!" to the winner, the result to everyone else.
    if (updated.winnerValue !== null && updated.stages.length === 0) {
      const digits = prizeDigits(updated.totalNumbers);
      const extras = parsePrizeWins(updated.prizeResults)
        .filter((w) => w.kind !== "main")
        .map((w) => ({ label: prizeKindLabel(w.kind, digits), value: w.value, prize: w.prize, won: w.won }));
      void emailDrawResult(
        id,
        {
          winnerValue: updated.winnerValue,
          outcome: winnerNumber && winnerNumber.status !== "available" ? "won" : "nobody",
          prize: updated.prizeLabel,
          extras,
        },
        await mailOrigin(),
      );
    }
  }

  return NextResponse.json(toRaffleDTO(updated, await bankPaymentsOf(updated)));
}

/**
 * Deletes a raffle for good — its numbers, buyers, receipts and payment
 * accounts go with it. Only a closed raffle can be deleted, so a raffle that is
 * still selling can't disappear by a slip of the finger.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.raffle.findUnique({ where: { id }, select: { ownerId: true, status: true, deletedAt: true } });
  const tenantId = tenantIdFor(user);
  if (!existing || existing.deletedAt || !tenantId || existing.ownerId !== tenantId) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }
  if (existing.status !== "closed") {
    return NextResponse.json({ error: "Cierra la rifa antes de eliminarla." }, { status: 409 });
  }

  // To the trash, not gone: it can be restored for TRASH_DAYS, and the record keeps who and when.
  const trashed = await trashRaffle(id, { name: user.name });
  if (trashed) {
    void notifyTeam(tenantId, user.id, {
      title: "Rifa eliminada",
      body: `${user.name} eliminó «${trashed.name}». Se puede restaurar durante ${TRASH_DAYS} días desde Mis rifas → Papelera.`,
      url: "/rifas",
    });
  }
  return new NextResponse(null, { status: 204 });
}
