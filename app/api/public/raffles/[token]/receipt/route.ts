import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notifyTeam } from "@/lib/push";
import { checkPublicRateLimit, checkReceiptLookupLimit, getClientIp } from "@/lib/rateLimit";
import { phoneDigits, samePhone } from "@/lib/reservations";
import { publishRaffleChange } from "@/lib/realtime";
import { BODY_LIMITS, RECEIPT_IMAGE_RE, readJsonBody } from "@/lib/body";
import { buyerRowSelect, emailBuyers, mailOrigin } from "@/lib/buyerMail";

const KEY_SHAPE = /^[A-Za-z0-9_-]{22}$/;

// The browser compresses the photo to a few hundred KB before sending; this is
// only a ceiling so the endpoint can't be used to fill the database.
const MAX_PHOTO_DATA_URL_LENGTH = 1.5 * 1024 * 1024;

// Who is sending: the secret key of a reservation (right after making it), or the phone
// number it was made with (later, from any device). Exactly one of the two.
const receiptSchema = z
  .object({
    key: z.string().regex(KEY_SHAPE).optional(),
    phone: z.string().trim().max(30).optional(),
    // No SVG (it can carry scripts): only the formats a phone camera or screenshot produces.
    photoDataUrl: z.string().regex(RECEIPT_IMAGE_RE),
    // Who owns the account the payment came from (what the bank's notice shows), to match the payment.
    payerName: z.string().trim().max(80).optional(),
  })
  .refine((v) => (v.key === undefined) !== (v.phone === undefined));

/**
 * The visitor who reserved numbers attaches their payment receipt. Either the
 * secret `key` from the reservation (it only reaches that reservation's numbers)
 * or the phone number they reserved with (it reaches their still-unpaid online
 * reservations in this raffle). Both stop working once the numbers are freed or
 * resold. A phone is a weak identity, so it is limited per IP and, at worst,
 * lets someone attach a picture that the organizer then sees is not a receipt.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!checkPublicRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Demasiados intentos. Espera un momento." }, { status: 429 });
  }
  const { token } = await params;

  const rawBody = await readJsonBody(req, BODY_LIMITS.receipt);
  if (!rawBody.ok) return rawBody.response;
  const raw: unknown = rawBody.value;
  const parsed = receiptSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "La imagen no es válida." }, { status: 400 });
  if (parsed.data.photoDataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
    return NextResponse.json({ error: "La imagen es demasiado grande." }, { status: 413 });
  }

  const raffle = await prisma.raffle.findUnique({
    where: { publicToken: token },
    select: { id: true, ownerId: true, name: true, status: true },
  });
  // Same answer for a wrong link and a wrong key, so neither can be probed.
  const gone = NextResponse.json(
    { error: "No encontramos una reserva pendiente con esos datos. Revisa el teléfono; puede que ya se haya liberado." },
    { status: 404 },
  );
  if (!raffle) return gone;

  let mine: { id: string; buyerName: string | null; photoDataUrl: string | null }[];
  if (parsed.data.key !== undefined) {
    mine = await prisma.raffleNumber.findMany({
      where: { raffleId: raffle.id, holdToken: parsed.data.key, online: true, status: { in: ["occupied", "paid"] } },
      select: { id: true, buyerName: true, photoDataUrl: true },
    });
  } else {
    if (!checkReceiptLookupLimit(getClientIp(req))) {
      return NextResponse.json({ error: "Demasiados intentos. Inténtalo más tarde." }, { status: 429 });
    }
    if (phoneDigits(parsed.data.phone).length < 7) {
      return NextResponse.json({ error: "Escribe el teléfono con el que reservaste." }, { status: 400 });
    }
    // Only reservations still waiting for payment: a paid one has nothing left to prove.
    const held = await prisma.raffleNumber.findMany({
      where: { raffleId: raffle.id, online: true, status: "occupied", buyerPhone: { not: null } },
      select: { id: true, buyerName: true, buyerPhone: true, photoDataUrl: true },
    });
    mine = held.filter((n) => samePhone(n.buyerPhone, parsed.data.phone));
  }
  if (mine.length === 0) return gone;

  // With several reservations under one phone, a new receipt goes to the ones still without
  // one instead of replacing what was already sent.
  const withoutReceipt = mine.filter((n) => !n.photoDataUrl);
  if (withoutReceipt.length > 0) mine = withoutReceipt;

  // A new receipt replaces a rejected one: it is back to "waiting for review".
  await prisma.raffleNumber.updateMany({
    where: { id: { in: mine.map((n) => n.id) } },
    data: {
      photoDataUrl: parsed.data.photoDataUrl,
      receiptRejectedAt: null,
      receiptRejectReason: null,
      ...(parsed.data.payerName ? { payerName: parsed.data.payerName } : {}),
    },
  });
  const rows = await prisma.raffleNumber.findMany({ where: { id: { in: mine.map((n) => n.id) } }, select: buyerRowSelect });
  void emailBuyers(raffle.id, rows, { kind: "receipt" }, await mailOrigin());
  publishRaffleChange(raffle.id);
  void notifyTeam(raffle.ownerId, "", {
    title: `${raffle.name} · comprobante recibido`,
    body: `${mine[0]!.buyerName ?? "Un comprador"} subió su comprobante de pago`,
    url: `/rifas/${raffle.id}`,
  });

  return NextResponse.json({ ok: true });
}
