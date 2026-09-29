import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notifyTeam } from "@/lib/push";
import { checkPublicRateLimit, getClientIp } from "@/lib/rateLimit";
import { publishRaffleChange } from "@/lib/realtime";

const KEY_SHAPE = /^[A-Za-z0-9_-]{22}$/;

// The browser compresses the photo to a few hundred KB before sending; this is
// only a ceiling so the endpoint can't be used to fill the database.
const MAX_PHOTO_DATA_URL_LENGTH = 1.5 * 1024 * 1024;

const receiptSchema = z.object({
  key: z.string().regex(KEY_SHAPE),
  // No SVG (it can carry scripts): only the formats a phone camera or screenshot produces.
  photoDataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/),
});

/**
 * The visitor who reserved numbers attaches their payment receipt. The secret
 * `key` from the reservation is the permission: it only reaches that
 * reservation's numbers, and stops working once they are freed or resold.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!checkPublicRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Demasiados intentos. Espera un momento." }, { status: 429 });
  }
  const { token } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
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
  const gone = NextResponse.json({ error: "No encontramos tu reserva. Puede que ya se haya liberado." }, { status: 404 });
  if (!raffle) return gone;

  const mine = await prisma.raffleNumber.findMany({
    where: { raffleId: raffle.id, holdToken: parsed.data.key, online: true, status: { in: ["occupied", "paid"] } },
    select: { id: true, buyerName: true },
  });
  if (mine.length === 0) return gone;

  await prisma.raffleNumber.updateMany({
    where: { id: { in: mine.map((n) => n.id) } },
    data: { photoDataUrl: parsed.data.photoDataUrl },
  });
  publishRaffleChange(raffle.id);
  void notifyTeam(raffle.ownerId, "", {
    title: `${raffle.name} · comprobante recibido`,
    body: `${mine[0]!.buyerName ?? "Un comprador"} subió su comprobante de pago`,
    url: `/rifas/${raffle.id}`,
  });

  return NextResponse.json({ ok: true });
}
