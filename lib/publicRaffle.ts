import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { MAX_LOOSE_PER_RESERVATION, MAX_SETS_PER_RESERVATION, reservationsOpen } from "@/lib/reservations";
import type { DrawTrigger, PublicRaffleDTO } from "@/lib/types";

/** 128 bits of randomness, URL-safe (22 characters). Unguessable, so the link itself is the secret. */
export function newPublicToken(): string {
  return randomBytes(16).toString("base64url");
}

// base64url of 16 bytes is exactly 22 chars of [A-Za-z0-9_-]; anything else can't be a token.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{22}$/;

/**
 * The public view of a raffle, or null when the link doesn't exist or was
 * switched off. The only data path for anonymous visitors: it selects fields
 * explicitly, so nothing private (buyers, phones, photos, payments) can leak
 * by adding a column to the tables later.
 */
export async function getPublicRaffle(token: string): Promise<PublicRaffleDTO | null> {
  if (!TOKEN_SHAPE.test(token)) return null;

  const raffle = await prisma.raffle.findUnique({
    where: { publicToken: token },
    select: {
      name: true,
      prizeLabel: true,
      lottery: true,
      numberPrice: true,
      drawDate: true,
      drawTrigger: true,
      status: true,
      winnerValue: true,
      totalNumbers: true,
      holdDays: true,
      publicReservations: true,
      owner: { select: { publicReservations: true } },
      themeBackground: true,
      themeNumberColor: true,
      themeTextColor: true,
      accounts: { orderBy: { position: "asc" }, select: { id: true, label: true, number: true, holderName: true } },
      groups: { orderBy: { position: "asc" }, select: { id: true, label: true, price: true } },
      numbers: { orderBy: { value: "asc" }, select: { value: true, status: true, groupId: true } },
    },
  });
  if (!raffle) return null;

  const labelOf = new Map(raffle.groups.map((g) => [g.id, g.label]));
  const numbers = raffle.numbers.map((n) => ({
    value: n.value,
    sold: n.status !== "available",
    group: n.groupId ? (labelOf.get(n.groupId) ?? null) : null,
  }));

  return {
    name: raffle.name,
    prizeLabel: raffle.prizeLabel,
    lottery: raffle.lottery,
    numberPrice: raffle.numberPrice,
    drawDate: raffle.drawDate ? raffle.drawDate.toISOString() : null,
    drawTrigger: raffle.drawTrigger as DrawTrigger,
    soldCount: numbers.filter((n) => n.sold).length,
    paidCount: raffle.numbers.filter((n) => n.status === "paid").length,
    status: raffle.status as "active" | "closed",
    winnerValue: raffle.status === "closed" ? raffle.winnerValue : null,
    totalNumbers: raffle.totalNumbers,
    themeBackground: raffle.themeBackground,
    themeNumberColor: raffle.themeNumberColor,
    themeTextColor: raffle.themeTextColor,
    accounts: raffle.accounts,
    groups: raffle.groups.map((g) => ({
      label: g.label,
      price: g.price,
      sold: numbers.filter((n) => n.group === g.label).every((n) => n.sold),
    })),
    numbers,
    reservations: {
      open: reservationsOpen({
        raffleSetting: raffle.publicReservations,
        organizationDefault: raffle.owner.publicReservations,
        holdDays: raffle.holdDays,
        status: raffle.status,
      }),
      holdDays: raffle.holdDays,
      maxLoose: MAX_LOOSE_PER_RESERVATION,
      maxSets: MAX_SETS_PER_RESERVATION,
    },
  };
}
