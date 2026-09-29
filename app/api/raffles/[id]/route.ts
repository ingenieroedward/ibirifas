import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { toNumberDTO } from "@/lib/numberDto";
import { formatNumberValue } from "@/lib/format";
import { notifyTeam } from "@/lib/push";
import { publishRaffleChange } from "@/lib/realtime";
import type { RaffleAccountDTO, RaffleDTO, RaffleGroupDTO } from "@/lib/types";
import type { Prisma } from "@prisma/client";

const MAX_ACCOUNTS = 5;

type RaffleWithNumbers = Prisma.RaffleGetPayload<{
  include: {
    numbers: {
      include: { updatedBy: { select: { name: true } } };
    };
    accounts: true;
    groups: true;
  };
}>;

/** Shared GET/PATCH response mapping — keep this the single source of truth for RaffleDTO shape. */
function toRaffleDTO(raffle: RaffleWithNumbers): RaffleDTO {
  const numbers = raffle.numbers.map(toNumberDTO);

  const groups: RaffleGroupDTO[] = raffle.groups
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((g) => ({ id: g.id, label: g.label, price: g.price }));

  const accounts: RaffleAccountDTO[] = raffle.accounts
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((a) => ({
      id: a.id,
      label: a.label,
      number: a.number,
      holderName: a.holderName,
    }));

  return {
    id: raffle.id,
    name: raffle.name,
    prizeLabel: raffle.prizeLabel,
    lottery: raffle.lottery,
    numberPrice: raffle.numberPrice,
    totalNumbers: raffle.totalNumbers,
    drawDate: raffle.drawDate ? raffle.drawDate.toISOString() : null,
    status: raffle.status as "active" | "closed",
    winnerValue: raffle.winnerValue,
    closedAt: raffle.closedAt ? raffle.closedAt.toISOString() : null,
    numbers,
    accounts,
    groups,
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

const accountSchema = z.object({
  label: z.string().trim().min(1).max(40),
  number: z.string().trim().min(1).max(60),
  holderName: z.string().trim().max(80).nullable().optional(),
});

const updateRaffleSchema = z.object({
  status: z.enum(["active", "closed"]).optional(),
  winnerValue: z.number().int().min(0).nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  prizeLabel: z.string().trim().max(120).nullable().optional(),
  lottery: z.string().trim().max(80).nullable().optional(),
  numberPrice: z.number().int().positive().optional(),
  drawDate: z.string().datetime().nullable().optional(),
  themeBackground: hexColorSchema,
  themeNumberColor: hexColorSchema,
  themeTextColor: hexColorSchema,
  accounts: z.array(accountSchema).max(MAX_ACCOUNTS).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const raffle = await prisma.raffle.findUnique({
    where: { id },
    include: {
      numbers: {
        orderBy: { value: "asc" },
        include: { updatedBy: { select: { name: true } } },
      },
      accounts: true,
      groups: true,
    },
  });

  if (!raffle) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  const tenantId = tenantIdFor(user);
  if (!tenantId || raffle.ownerId !== tenantId) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  return NextResponse.json(toRaffleDTO(raffle));
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
  if (!existing) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  const tenantId = tenantIdFor(user);
  if (!tenantId || existing.ownerId !== tenantId) {
    // 404, not 403: don't reveal that a raffle belonging to someone else exists.
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = updateRaffleSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const input = parsed.data;
  const data: Prisma.RaffleUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.prizeLabel !== undefined) data.prizeLabel = input.prizeLabel;
  if (input.lottery !== undefined) data.lottery = input.lottery;
  if (input.numberPrice !== undefined) data.numberPrice = input.numberPrice;
  if (input.drawDate !== undefined) {
    data.drawDate = input.drawDate ? new Date(input.drawDate) : null;
  }
  if (input.themeBackground !== undefined) data.themeBackground = input.themeBackground;
  if (input.themeNumberColor !== undefined) data.themeNumberColor = input.themeNumberColor;
  if (input.themeTextColor !== undefined) data.themeTextColor = input.themeTextColor;

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
    }
  } else {
    if (input.winnerValue !== undefined && input.winnerValue !== null && input.winnerValue >= existing.totalNumbers) {
      return NextResponse.json({ error: `El número ${input.winnerValue} no existe en esta rifa` }, { status: 400 });
    }
    if (!wasClosed) {
      data.status = "closed";
      data.closedAt = new Date();
      data.winnerValue = input.winnerValue ?? null;
    } else if (input.winnerValue !== undefined) {
      data.winnerValue = input.winnerValue;
    }
  }
  const justClosed = !wasClosed && nextStatus === "closed";

  await prisma.$transaction(async (tx) => {
    await tx.raffle.update({ where: { id }, data });

    // `accounts` follows the same "undefined vs provided" convention as the
    // other optional fields: absent means "leave untouched", present means
    // "this is the complete desired list" (full replace).
    if (input.accounts !== undefined) {
      await tx.raffleAccount.deleteMany({ where: { raffleId: id } });
      if (input.accounts.length > 0) {
        await tx.raffleAccount.createMany({
          data: input.accounts.map((account, position) => ({
            raffleId: id,
            label: account.label,
            number: account.number,
            holderName: account.holderName || null,
            position,
          })),
        });
      }
    }
  });

  const updated = await prisma.raffle.findUniqueOrThrow({
    where: { id },
    include: {
      numbers: {
        orderBy: { value: "asc" },
        include: { updatedBy: { select: { name: true } } },
      },
      accounts: true,
      groups: true,
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
    void notifyTeam(tenantId, user.id, { title: `${updated.name} · rifa cerrada`, body, url: `/rifas/${id}` });
  }

  return NextResponse.json(toRaffleDTO(updated));
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
  const existing = await prisma.raffle.findUnique({ where: { id }, select: { ownerId: true, status: true } });
  const tenantId = tenantIdFor(user);
  if (!existing || !tenantId || existing.ownerId !== tenantId) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }
  if (existing.status !== "closed") {
    return NextResponse.json({ error: "Cierra la rifa antes de eliminarla." }, { status: 409 });
  }

  await prisma.raffle.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
