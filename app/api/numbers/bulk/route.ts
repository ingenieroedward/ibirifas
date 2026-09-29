import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { describeEvent, notifyTeam } from "@/lib/push";
import { publishRaffleChange } from "@/lib/realtime";
import { toNumberDTO } from "@/lib/numberDto";
import type { PaymentStatus } from "@/lib/types";

const MAX_IDS = 100;
const MAX_PHOTO_DATA_URL_LENGTH = 3 * 1024 * 1024;

const idsSchema = z.array(z.string().min(1)).min(1).max(MAX_IDS);

const trimmedOptional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sell"),
    ids: idsSchema,
    buyerName: z.string().trim().min(1).max(120),
    buyerPhone: trimmedOptional(120),
    photoDataUrl: z
      .string()
      .startsWith("data:image/")
      .max(MAX_PHOTO_DATA_URL_LENGTH)
      .nullable()
      .optional(),
  }),
  z.object({
    action: z.literal("pay"),
    ids: idsSchema,
    paymentMethod: z.enum(["cash", "nequi", "transfer", "other"]),
  }),
]);

class ConflictError extends Error {}

/**
 * Several numbers for one buyer in a single request. All-or-nothing: if any
 * number is no longer in the expected state (another seller got there first),
 * nothing is written and the caller gets a 409 to refresh and retry.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = bulkSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const input = parsed.data;
  const ids = [...new Set(input.ids)];

  const found = await prisma.raffleNumber.findMany({
    where: { id: { in: ids } },
    select: { id: true, raffleId: true, raffle: { select: { ownerId: true } } },
  });

  const tenantId = tenantIdFor(user);
  // 404 for missing and for someone else's numbers alike, so existence doesn't leak.
  if (!tenantId || found.length !== ids.length || found.some((n) => n.raffle.ownerId !== tenantId)) {
    return NextResponse.json({ error: "Número no encontrado" }, { status: 404 });
  }
  if (new Set(found.map((n) => n.raffleId)).size !== 1) {
    return NextResponse.json({ error: "Los números deben ser de la misma rifa" }, { status: 400 });
  }

  // Which numbers actually changed hands, for the notification (paying a number
  // that was already paid is a no-op and shouldn't announce anything).
  let newlyPaidValues: number[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      if (input.action === "sell") {
        const { count } = await tx.raffleNumber.updateMany({
          where: { id: { in: ids }, status: "available" },
          data: {
            status: "occupied",
            paymentStatus: "pending" satisfies PaymentStatus,
            paymentMethod: null,
            buyerName: input.buyerName,
            buyerPhone: input.buyerPhone ?? null,
            photoDataUrl: input.photoDataUrl ?? null,
            notes: null,
            updatedById: user.id,
          },
        });
        if (count !== ids.length) {
          throw new ConflictError("Alguno de los números ya fue vendido. Actualiza el tablero e inténtalo de nuevo.");
        }
        return;
      }

      // "pay": every number must already have a buyer; ones already paid keep
      // their original method rather than being overwritten.
      const withBuyer = await tx.raffleNumber.count({
        where: { id: { in: ids }, status: { in: ["occupied", "paid"] } },
      });
      if (withBuyer !== ids.length) {
        throw new ConflictError("Alguno de los números ya no tiene comprador. Actualiza el tablero e inténtalo de nuevo.");
      }
      const toPay = await tx.raffleNumber.findMany({
        where: { id: { in: ids }, status: "occupied" },
        select: { value: true },
      });
      newlyPaidValues = toPay.map((n) => n.value);
      await tx.raffleNumber.updateMany({
        where: { id: { in: ids }, status: "occupied" },
        data: {
          status: "paid",
          paymentStatus: "paid" satisfies PaymentStatus,
          paymentMethod: input.paymentMethod,
          updatedById: user.id,
        },
      });
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  publishRaffleChange(found[0]!.raffleId);

  const updated = await prisma.raffleNumber.findMany({
    where: { id: { in: ids } },
    orderBy: { value: "asc" },
    include: { updatedBy: { select: { name: true } } },
  });

  const raffle = await prisma.raffle.findUnique({
    where: { id: found[0]!.raffleId },
    select: { name: true, numberPrice: true },
  });
  if (raffle) {
    const buyers = [...new Set(updated.map((n) => n.buyerName).filter((name): name is string => Boolean(name)))];
    const buyerName = buyers.length === 0 ? null : buyers.length <= 2 ? buyers.join(" y ") : "varios compradores";
    if (input.action === "sell") {
      void notifyTeam(tenantId, user.id, {
        title: raffle.name,
        body: describeEvent({
          kind: "sold",
          actorName: user.name,
          buyerName: input.buyerName,
          values: updated.map((n) => n.value),
          numberPrice: raffle.numberPrice,
        }),
        url: `/rifas/${found[0]!.raffleId}`,
      });
    } else if (newlyPaidValues.length > 0) {
      void notifyTeam(tenantId, user.id, {
        title: raffle.name,
        body: describeEvent({
          kind: "paid",
          actorName: user.name,
          buyerName,
          values: newlyPaidValues,
          numberPrice: raffle.numberPrice,
          paymentMethod: input.paymentMethod,
        }),
        url: `/rifas/${found[0]!.raffleId}`,
      });
    }
  }

  const dtos = updated.map(toNumberDTO);

  return NextResponse.json(dtos);
}
