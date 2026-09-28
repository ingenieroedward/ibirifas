import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import type {
  NumberStatus,
  PaymentMethod,
  PaymentStatus,
  RaffleDTO,
  RaffleNumberDTO,
} from "@/lib/types";
import type { Prisma } from "@prisma/client";

type RaffleWithNumbers = Prisma.RaffleGetPayload<{
  include: {
    numbers: {
      include: { updatedBy: { select: { name: true } } };
    };
  };
}>;

/** Shared GET/PATCH response mapping — keep this the single source of truth for RaffleDTO shape. */
function toRaffleDTO(raffle: RaffleWithNumbers): RaffleDTO {
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
    updatedByName: n.updatedBy?.name ?? null,
    updatedAt: n.updatedAt.toISOString(),
  }));

  return {
    id: raffle.id,
    name: raffle.name,
    prizeLabel: raffle.prizeLabel,
    numberPrice: raffle.numberPrice,
    totalNumbers: raffle.totalNumbers,
    drawDate: raffle.drawDate ? raffle.drawDate.toISOString() : null,
    status: raffle.status as "active" | "closed",
    numbers,
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

const updateRaffleSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  prizeLabel: z.string().trim().max(120).nullable().optional(),
  numberPrice: z.number().int().positive().optional(),
  drawDate: z.string().datetime().nullable().optional(),
  themeBackground: hexColorSchema,
  themeNumberColor: hexColorSchema,
  themeTextColor: hexColorSchema,
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
  if (input.numberPrice !== undefined) data.numberPrice = input.numberPrice;
  if (input.drawDate !== undefined) {
    data.drawDate = input.drawDate ? new Date(input.drawDate) : null;
  }
  if (input.themeBackground !== undefined) data.themeBackground = input.themeBackground;
  if (input.themeNumberColor !== undefined) data.themeNumberColor = input.themeNumberColor;
  if (input.themeTextColor !== undefined) data.themeTextColor = input.themeTextColor;

  await prisma.raffle.update({ where: { id }, data });

  const updated = await prisma.raffle.findUniqueOrThrow({
    where: { id },
    include: {
      numbers: {
        orderBy: { value: "asc" },
        include: { updatedBy: { select: { name: true } } },
      },
    },
  });

  return NextResponse.json(toRaffleDTO(updated));
}
