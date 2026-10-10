import { activationBlock } from "@/lib/billing";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { describeEvent, notifyTeam } from "@/lib/push";
import { publishRaffleChange } from "@/lib/realtime";
import { syncCompletion } from "@/lib/completion";
import { numberInclude, toNumberDTO } from "@/lib/numberDto";
import type { PaymentStatus } from "@/lib/types";
import { BODY_LIMITS, RECEIPT_IMAGE_RE, readJsonBody } from "@/lib/body";
import { buyerRowSelect, emailBuyers, mailOrigin, type BuyerRow } from "@/lib/buyerMail";
import { comboSalePrices, loosePrice, parseCombos } from "@/lib/combos";

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
      .regex(RECEIPT_IMAGE_RE)
      .max(MAX_PHOTO_DATA_URL_LENGTH)
      .nullable()
      .optional(),
  }),
  z.object({
    action: z.literal("pay"),
    ids: idsSchema,
    paymentMethod: z.enum(["cash", "nequi", "breb", "transfer", "other"]),
  }),
  z.object({ action: z.literal("unpay"), ids: idsSchema }),
  z.object({ action: z.literal("release"), ids: idsSchema }),
  // The receipt a buyer sent isn't valid: it is removed (they can send another) and they are told why.
  z.object({ action: z.literal("rejectReceipt"), ids: idsSchema, reason: trimmedOptional(200) }),
  z.object({
    action: z.literal("edit"),
    ids: idsSchema,
    buyerName: z.string().trim().min(1).max(120),
    buyerPhone: trimmedOptional(120),
  }),
]);

class ConflictError extends Error {}

/**
 * Several numbers in a single request: sell them to one buyer, collect them,
 * undo a payment, free them or correct the buyer. All-or-nothing: if any number
 * is no longer in the expected state (another seller got there first), nothing
 * is written and the caller gets a 409 to refresh and retry.
 *
 * Numbers of a lettered set only ever move together, so a request that names
 * part of a set is refused; this is also how a whole set is sold at once.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rawBodyBody = await readJsonBody(req, BODY_LIMITS.photo);
  if (!rawBodyBody.ok) return rawBodyBody.response;
  const rawBody: unknown = rawBodyBody.value;

  const parsed = bulkSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const input = parsed.data;
  const ids = [...new Set(input.ids)];

  const found = await prisma.raffleNumber.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      value: true,
      raffleId: true,
      groupId: true,
      raffle: { select: { ownerId: true, status: true, numberPrice: true, combos: true, _count: { select: { stages: true } } } },
    },
  });

  const tenantId = tenantIdFor(user);
  // 404 for missing and for someone else's numbers alike, so existence doesn't leak.
  if (!tenantId || found.length !== ids.length || found.some((n) => n.raffle.ownerId !== tenantId)) {
    return NextResponse.json({ error: "Número no encontrado" }, { status: 404 });
  }
  if (new Set(found.map((n) => n.raffleId)).size !== 1) {
    return NextResponse.json({ error: "Los números deben ser de la misma rifa" }, { status: 400 });
  }

  const blocked = await activationBlock(found[0]!.raffleId);
  if (blocked) return blocked;

  // A closed raffle no longer changes hands; collecting payments and fixing buyer details still works.
  if (found[0]!.raffle.status === "closed" && (input.action === "sell" || input.action === "release")) {
    return NextResponse.json({ error: "La rifa está cerrada: ya no se venden ni se liberan números." }, { status: 409 });
  }

  // In a raffle by stages money comes in installments (/api/numbers/quotas), never as a plain "paid".
  if (found[0]!.raffle._count.stages > 0 && (input.action === "pay" || input.action === "unpay")) {
    return NextResponse.json(
      { error: "En una rifa por etapas se cobra por cuotas: usa «Cobrar cuota» o «Cobrar todo»." },
      { status: 400 },
    );
  }

  // A set is all or nothing.
  const groupIds = [...new Set(found.map((n) => n.groupId).filter((g): g is string => g !== null))];
  if (groupIds.length > 0) {
    const members = await prisma.raffleNumber.findMany({
      where: { groupId: { in: groupIds } },
      select: { id: true },
    });
    const requested = new Set(ids);
    if (members.some((m) => !requested.has(m.id))) {
      return NextResponse.json(
        { error: "Un conjunto se vende, cobra y libera completo, no por partes." },
        { status: 400 },
      );
    }
  }

  // Which numbers actually changed hands, for the notification (paying a number
  // that was already paid is a no-op and shouldn't announce anything).
  let newlyPaidValues: number[] = [];
  let releasedBefore: BuyerRow[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      if (input.action === "sell") {
        const { count } = await tx.raffleNumber.updateMany({
          where: { id: { in: ids }, status: "available" },
          data: {
            status: "occupied",
            paymentStatus: "pending" satisfies PaymentStatus,
            paymentMethod: null,
            paymentRef: null,
            buyerName: input.buyerName,
            buyerPhone: input.buyerPhone ?? null,
            photoDataUrl: input.photoDataUrl ?? null,
            notes: null,
            updatedById: user.id,
            soldById: user.id,
            soldAt: new Date(),
            online: false,
            holdToken: null,
            buyerEmail: null,
            receiptRejectedAt: null,
            receiptRejectReason: null,
            privacyConsentAt: null,
            payerName: null,
            salePrice: null,
          },
        });
        if (count !== ids.length) {
          throw new ConflictError("Alguno de los números ya fue vendido. Actualiza el tablero e inténtalo de nuevo.");
        }
        // Loose numbers sold together get the raffle's combos (lib/combos.ts): each stores its share.
        const combos = parseCombos(found[0]!.raffle.combos);
        const loose = found.filter((n) => n.groupId === null).sort((a, b) => a.value - b.value);
        if (combos.length > 0 && loose.length > 1) {
          const prices = comboSalePrices(loose.length, found[0]!.raffle.numberPrice, combos);
          for (const [i, n] of loose.entries()) {
            if (prices[i] !== null) await tx.raffleNumber.update({ where: { id: n.id }, data: { salePrice: prices[i] } });
          }
        }
        return;
      }

      if (input.action === "release") {
        await tx.numberQuota.deleteMany({ where: { numberId: { in: ids } } });
        releasedBefore = await tx.raffleNumber.findMany({
          where: { id: { in: ids }, status: { not: "available" } },
          select: buyerRowSelect,
        });
        await tx.raffleNumber.updateMany({
          where: { id: { in: ids } },
          data: {
            status: "available",
            buyerName: null,
            buyerPhone: null,
            photoDataUrl: null,
            notes: null,
            paymentStatus: "pending" satisfies PaymentStatus,
            paymentMethod: null,
            paymentRef: null,
            updatedById: user.id,
            soldById: null,
            soldAt: null,
            online: false,
            holdToken: null,
            buyerEmail: null,
            receiptRejectedAt: null,
            receiptRejectReason: null,
            privacyConsentAt: null,
            payerName: null,
            salePrice: null,
          },
        });
        return;
      }

      if (input.action === "rejectReceipt") {
        const toReview = await tx.raffleNumber.count({
          where: { id: { in: ids }, status: "occupied", photoDataUrl: { not: null } },
        });
        if (toReview !== ids.length) {
          throw new ConflictError("No hay un comprobante pendiente por revisar. Actualiza el tablero.");
        }
        await tx.raffleNumber.updateMany({
          where: { id: { in: ids } },
          data: { photoDataUrl: null, receiptRejectedAt: new Date(), receiptRejectReason: input.reason ?? null, updatedById: user.id },
        });
        return;
      }

      if (input.action === "unpay") {
        const withBuyer = await tx.raffleNumber.count({
          where: { id: { in: ids }, status: { in: ["occupied", "paid"] } },
        });
        if (withBuyer !== ids.length) {
          throw new ConflictError("Alguno de los números ya no tiene comprador. Actualiza el tablero e inténtalo de nuevo.");
        }
        await tx.raffleNumber.updateMany({
          where: { id: { in: ids }, status: "paid" },
          data: {
            status: "occupied",
            paymentStatus: "pending" satisfies PaymentStatus,
            paymentMethod: null,
            paymentRef: null,
            updatedById: user.id,
          },
        });
        return;
      }

      if (input.action === "edit") {
        const withBuyer = await tx.raffleNumber.count({
          where: { id: { in: ids }, status: { in: ["occupied", "paid"] } },
        });
        if (withBuyer !== ids.length) {
          throw new ConflictError("Alguno de los números ya no tiene comprador. Actualiza el tablero e inténtalo de nuevo.");
        }
        await tx.raffleNumber.updateMany({
          where: { id: { in: ids } },
          data: {
            buyerName: input.buyerName,
            ...(input.buyerPhone !== undefined ? { buyerPhone: input.buyerPhone } : {}),
            updatedById: user.id,
          },
        });
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
          paymentRef: null,
          receiptRejectedAt: null,
          receiptRejectReason: null,
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
  void syncCompletion(found[0]!.raffleId);

  const updated = await prisma.raffleNumber.findMany({
    where: { id: { in: ids } },
    orderBy: { value: "asc" },
    include: numberInclude,
  });

  const raffle = await prisma.raffle.findUnique({
    where: { id: found[0]!.raffleId },
    select: { name: true, numberPrice: true },
  });
  if (raffle) {
    const buyers = [...new Set(updated.map((n) => n.buyerName).filter((name): name is string => Boolean(name)))];
    const buyerName = buyers.length === 0 ? null : buyers.length <= 2 ? buyers.join(" y ") : "varios compradores";
    const url = `/rifas/${found[0]!.raffleId}`;

    // What the team is told: whole sets by letter and their set price, loose numbers by number.
    const sets = groupIds.length
      ? await prisma.raffleGroup.findMany({ where: { id: { in: groupIds } }, orderBy: { position: "asc" } })
      : [];
    const isLoose = (n: { groupId: string | null }) => n.groupId === null;
    const describe = (rows: { value: number; groupId: string | null; salePrice: number | null }[]) => ({
      sets: sets.map((g) => g.label),
      looseValues: rows.filter(isLoose).map((n) => n.value),
      amount: sets.reduce((sum, g) => sum + g.price, 0) + rows.filter(isLoose).reduce((sum, n) => sum + loosePrice(n, raffle.numberPrice), 0),
    });

    if (input.action === "sell") {
      void notifyTeam(tenantId, user.id, {
        title: raffle.name,
        body: describeEvent({
          kind: "sold",
          actorName: user.name,
          buyerName: input.buyerName,
          values: updated.map((n) => n.value),
          numberPrice: raffle.numberPrice,
          ...describe(updated),
        }),
        url,
      });
    } else if (input.action === "pay" && newlyPaidValues.length > 0) {
      const paidRows = updated.filter((n) => newlyPaidValues.includes(n.value));
      const paidGroupIds = new Set(paidRows.map((n) => n.groupId).filter((g): g is string => g !== null));
      const paidSets = sets.filter((g) => paidGroupIds.has(g.id));
      void notifyTeam(tenantId, user.id, {
        title: raffle.name,
        body: describeEvent({
          kind: "paid",
          actorName: user.name,
          buyerName,
          values: newlyPaidValues,
          numberPrice: raffle.numberPrice,
          paymentMethod: input.paymentMethod,
          sets: paidSets.map((g) => g.label),
          looseValues: paidRows.filter(isLoose).map((n) => n.value),
          amount: paidSets.reduce((sum, g) => sum + g.price, 0) + paidRows.filter(isLoose).reduce((sum, n) => sum + loosePrice(n, raffle.numberPrice), 0),
        }),
        url,
      });
    } else if (input.action === "release" && releasedBefore.length > 0) {
      const beforeBuyers = [...new Set(releasedBefore.map((n) => n.buyerName).filter((name): name is string => Boolean(name)))];
      void notifyTeam(tenantId, user.id, {
        title: raffle.name,
        body: describeEvent({
          kind: "released",
          actorName: user.name,
          buyerName: beforeBuyers.length === 0 ? null : beforeBuyers.length <= 2 ? beforeBuyers.join(" y ") : "varios compradores",
          values: releasedBefore.map((n) => n.value),
          numberPrice: raffle.numberPrice,
          ...describe(updated),
        }),
        url,
      });
    }
  }

  // Buyers who reserved online with an email hear what happened.
  const origin = await mailOrigin();
  const raffleId = found[0]!.raffleId;
  if (input.action === "pay" && newlyPaidValues.length > 0) {
    const rows = await prisma.raffleNumber.findMany({ where: { id: { in: ids }, value: { in: newlyPaidValues } }, select: buyerRowSelect });
    void emailBuyers(raffleId, rows, { kind: "approved", method: input.paymentMethod }, origin);
  } else if (input.action === "release" && releasedBefore.length > 0) {
    void emailBuyers(raffleId, releasedBefore, { kind: "released", why: "manual" }, origin);
  } else if (input.action === "rejectReceipt") {
    const rows = await prisma.raffleNumber.findMany({ where: { id: { in: ids } }, select: buyerRowSelect });
    void emailBuyers(raffleId, rows, { kind: "rejected", reason: input.reason ?? null }, origin);
  }

  const dtos = updated.map(toNumberDTO);

  return NextResponse.json(dtos);
}
