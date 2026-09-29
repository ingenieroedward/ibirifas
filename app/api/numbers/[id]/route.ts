import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { describeEvent, notifyTeam, type SaleEvent } from "@/lib/push";
import { publishRaffleChange } from "@/lib/realtime";
import { numberInclude, toNumberDTO } from "@/lib/numberDto";
import type { NumberStatus, PaymentMethod, PaymentStatus } from "@/lib/types";

// ~3MB cap on the base64 payload itself (actual binary is smaller after
// decoding, but we just need a sane upper bound to protect the DB/response).
const MAX_PHOTO_DATA_URL_LENGTH = 3 * 1024 * 1024;

const trimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const updateNumberSchema = z.object({
  status: z.enum(["available", "occupied", "paid"]),
  buyerName: trimmedString(120),
  buyerPhone: trimmedString(120),
  notes: trimmedString(120),
  paymentMethod: z.enum(["cash", "nequi", "transfer", "other"]).nullable().optional(),
  photoDataUrl: z
    .string()
    .startsWith("data:image/", { message: "photoDataUrl debe ser una imagen data URL" })
    .max(MAX_PHOTO_DATA_URL_LENGTH, { message: "La foto es demasiado grande" })
    .nullable()
    .optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.raffleNumber.findUnique({
    where: { id },
    include: {
      raffle: { select: { ownerId: true, name: true, numberPrice: true, status: true } },
      group: { select: { label: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Número no encontrado" }, { status: 404 });
  }

  const tenantId = tenantIdFor(user);
  if (!tenantId || existing.raffle.ownerId !== tenantId) {
    return NextResponse.json({ error: "Número no encontrado" }, { status: 404 });
  }

  // A number in a lettered set moves with the whole set: selling, collecting or
  // freeing it alone would break the set (see /api/numbers/bulk).
  if (existing.group) {
    return NextResponse.json(
      { error: `Este número es del conjunto ${existing.group.label}. Se vende, cobra y libera el conjunto completo.` },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = updateNumberSchema.safeParse(rawBody);
  if (!parsed.success) {
    // A too-large photo payload gets its own status code (413) per spec;
    // everything else is a generic 400.
    const tooLarge = parsed.error.issues.some(
      (issue) => issue.path[0] === "photoDataUrl" && issue.code === "too_big",
    );
    if (tooLarge) {
      return NextResponse.json({ error: "La foto es demasiado grande" }, { status: 413 });
    }
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const input = parsed.data;
  const status: NumberStatus = input.status;

  // A closed raffle no longer changes hands: no new sales, no freeing numbers.
  // Payments and buyer details can still be kept up to date.
  if (existing.raffle.status === "closed" && (existing.status === "available" || status === "available")) {
    return NextResponse.json({ error: "La rifa está cerrada: ya no se venden ni se liberan números." }, { status: 409 });
  }

  let data: Prisma.RaffleNumberUpdateInput;

  if (status === "available") {
    data = {
      status: "available",
      buyerName: null,
      buyerPhone: null,
      photoDataUrl: null,
      notes: null,
      paymentStatus: "pending" satisfies PaymentStatus,
      paymentMethod: null,
      updatedBy: { connect: { id: user.id } },
      soldBy: { disconnect: true },
      soldAt: null,
    };
  } else {
    const resultingBuyerName =
      input.buyerName !== undefined ? input.buyerName : existing.buyerName;

    if (!resultingBuyerName || resultingBuyerName.trim().length === 0) {
      return NextResponse.json(
        { error: "Se requiere el nombre del comprador" },
        { status: 400 },
      );
    }

    const paymentStatus: PaymentStatus = status === "paid" ? "paid" : "pending";
    // paymentMethod only makes sense once paid; going back to "occupied"
    // (e.g. undoing a mistaken "pagado") clears it rather than leaving a
    // stale method behind.
    const paymentMethod: PaymentMethod | null =
      status === "paid" ? (input.paymentMethod ?? (existing.paymentMethod as PaymentMethod | null)) : null;

    data = {
      status,
      paymentStatus,
      paymentMethod,
      updatedBy: { connect: { id: user.id } },
    };

    // The sale is credited to whoever takes the number off the market, once.
    if (existing.status === "available") {
      data.soldBy = { connect: { id: user.id } };
      data.soldAt = new Date();
    }

    if (input.buyerName !== undefined) data.buyerName = input.buyerName;
    if (input.buyerPhone !== undefined) data.buyerPhone = input.buyerPhone;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.photoDataUrl !== undefined) data.photoDataUrl = input.photoDataUrl;
  }

  const updated = await prisma.raffleNumber.update({ where: { id }, data, include: numberInclude });
  publishRaffleChange(existing.raffleId);

  // Tell the rest of the team, but only for real changes of state — re-saving a
  // buyer's name on an already-sold number isn't news.
  const previous = existing.status as NumberStatus;
  let kind: SaleEvent["kind"] | null = null;
  if (previous === "available" && status === "occupied") kind = "sold";
  else if (previous === "available" && status === "paid") kind = "soldAndPaid";
  else if (previous === "occupied" && status === "paid") kind = "paid";
  else if (previous !== "available" && status === "available") kind = "released";

  if (kind) {
    void notifyTeam(tenantId, user.id, {
      title: existing.raffle.name,
      body: describeEvent({
        kind,
        actorName: user.name,
        // On release the buyer is gone from `updated`, so read it from before.
        buyerName: kind === "released" ? existing.buyerName : updated.buyerName,
        values: [updated.value],
        numberPrice: existing.raffle.numberPrice,
        paymentMethod: updated.paymentMethod as PaymentMethod | null,
      }),
      url: `/rifas/${existing.raffleId}`,
    });
  }

  return NextResponse.json(toNumberDTO(updated));
}
