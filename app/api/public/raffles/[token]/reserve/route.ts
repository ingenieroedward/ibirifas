import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { describeNumbers, notifyTeam } from "@/lib/push";
import { checkReserveRateLimit, getClientIp } from "@/lib/rateLimit";
import { publishRaffleChange } from "@/lib/realtime";
import { newPublicToken } from "@/lib/publicRaffle";
import {
  MAX_LOOSE_PER_RESERVATION,
  MAX_SETS_PER_RESERVATION,
  MAX_UNPAID_ONLINE_PER_PHONE,
  phoneDigits,
  reservationsOpen,
} from "@/lib/reservations";
import type { ReserveResultDTO } from "@/lib/types";

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{22}$/;

const reserveSchema = z.object({
  name: z.string().trim().min(2).max(60),
  phone: z.string().trim().max(30),
  numbers: z.array(z.number().int().min(0)).max(MAX_LOOSE_PER_RESERVATION),
  sets: z.array(z.string().regex(/^[A-Z]$/)).max(MAX_SETS_PER_RESERVATION),
});

class TakenError extends Error {}

/**
 * A visitor of the public link reserves numbers (or whole sets). No login: the
 * secret token is the permission, and it only works when the raffle allows it
 * and has a payment deadline. The numbers become the visitor's unpaid "apartados"
 * right away, so nobody else can take them; the team is notified and the
 * deadline (or a manual release) frees them if the visitor never pays.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!checkReserveRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Has hecho muchas reservas seguidas. Inténtalo más tarde." }, { status: 429 });
  }

  const { token } = await params;
  if (!TOKEN_SHAPE.test(token)) return NextResponse.json({ error: "Este enlace ya no está disponible." }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const parsed = reserveSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Revisa tu nombre, tu teléfono y lo que elegiste." }, { status: 400 });
  const input = parsed.data;

  const digits = phoneDigits(input.phone);
  if (digits.length < 7 || digits.length > 15) {
    return NextResponse.json({ error: "Escribe un teléfono válido para poder contactarte." }, { status: 400 });
  }
  const values = [...new Set(input.numbers)];
  const labels = [...new Set(input.sets)];
  if (values.length === 0 && labels.length === 0) {
    return NextResponse.json({ error: "Elige al menos un número o conjunto." }, { status: 400 });
  }

  const raffle = await prisma.raffle.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      ownerId: true,
      name: true,
      status: true,
      numberPrice: true,
      totalNumbers: true,
      holdDays: true,
      publicReservations: true,
      owner: { select: { publicReservations: true } },
      groups: { select: { id: true, label: true, price: true } },
    },
  });
  if (!raffle) return NextResponse.json({ error: "Este enlace ya no está disponible." }, { status: 404 });
  if (
    !reservationsOpen({
      raffleSetting: raffle.publicReservations,
      organizationDefault: raffle.owner.publicReservations,
      holdDays: raffle.holdDays,
      status: raffle.status,
    })
  ) {
    return NextResponse.json({ error: "Las reservas no están disponibles en esta rifa." }, { status: 403 });
  }

  const chosenGroups = labels.map((label) => raffle.groups.find((g) => g.label === label));
  if (chosenGroups.some((g) => !g)) return NextResponse.json({ error: "Ese conjunto no existe." }, { status: 400 });
  const groupIds = chosenGroups.map((g) => g!.id);

  const looseRows = await prisma.raffleNumber.findMany({
    where: { raffleId: raffle.id, value: { in: values } },
    select: { id: true, value: true, groupId: true },
  });
  if (looseRows.length !== values.length) return NextResponse.json({ error: "Ese número no existe." }, { status: 400 });
  const inSet = looseRows.find((n) => n.groupId !== null);
  if (inSet) {
    return NextResponse.json({ error: `El ${inSet.value} es de un conjunto: se reserva el conjunto completo.` }, { status: 400 });
  }
  const setRows = groupIds.length
    ? await prisma.raffleNumber.findMany({ where: { raffleId: raffle.id, groupId: { in: groupIds } }, select: { id: true } })
    : [];
  const ids = [...looseRows.map((n) => n.id), ...setRows.map((n) => n.id)];

  // One phone can't park an unlimited number of unpaid numbers.
  const held = await prisma.raffleNumber.findMany({
    where: { raffleId: raffle.id, online: true, status: "occupied", buyerPhone: { not: null } },
    select: { buyerPhone: true },
  });
  const heldByPhone = held.filter((n) => phoneDigits(n.buyerPhone) === digits).length;
  if (heldByPhone + ids.length > MAX_UNPAID_ONLINE_PER_PHONE) {
    return NextResponse.json(
      { error: "Ya tienes varios números reservados sin pagar. Paga esos primero o escríbele al organizador." },
      { status: 409 },
    );
  }

  const receiptKey = newPublicToken();
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.raffleNumber.updateMany({
        where: { id: { in: ids }, status: "available" },
        data: {
          status: "occupied",
          paymentStatus: "pending",
          paymentMethod: null,
          buyerName: input.name,
          buyerPhone: input.phone,
          photoDataUrl: null,
          notes: null,
          soldById: null,
          soldAt: new Date(),
          online: true,
          holdToken: receiptKey,
        },
      });
      if (count !== ids.length) throw new TakenError();
    });
  } catch (err) {
    if (err instanceof TakenError) {
      return NextResponse.json({ error: "Alguno de los que elegiste ya lo reservó otra persona. Revisa y vuelve a elegir." }, { status: 409 });
    }
    throw err;
  }

  publishRaffleChange(raffle.id);

  const total = chosenGroups.reduce((sum, g) => sum + g!.price, 0) + values.length * raffle.numberPrice;
  const what = [
    ...(labels.length > 0 ? [`${labels.length > 1 ? "los conjuntos" : "el conjunto"} ${labels.join(", ")}`] : []),
    ...(values.length > 0 ? [values.length > 1 ? `los números ${describeNumbers(values)}` : `el ${describeNumbers(values)}`] : []),
  ].join(" y ");
  void notifyTeam(raffle.ownerId, "", {
    title: `${raffle.name} · reserva en línea`,
    body: `${input.name} reservó ${what} · ${formatCurrency(total)}. Tiene ${raffle.holdDays} ${raffle.holdDays === 1 ? "día" : "días"} para pagar`,
    url: `/rifas/${raffle.id}`,
  });

  return NextResponse.json({
    total,
    holdDays: raffle.holdDays!,
    numbers: values.sort((a, b) => a - b),
    sets: labels.sort(),
    receiptKey,
  } satisfies ReserveResultDTO);
}
