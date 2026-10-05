import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

/**
 * The trash: deleting a raffle hides it for TRASH_DAYS (its organizer can restore it), then it is purged for good.
 * Only closed raffles can be deleted, so a trashed raffle no longer sells; its public link is switched off too, which
 * closes the public page, reservations and receipts at once.
 */
export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When a raffle trashed at `deletedAt` is purged. */
export function purgeDate(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_DAYS * DAY_MS);
}

/** What the record keeps about a raffle: enough to know what it was even after it is purged. */
export async function raffleRecord(raffleId: string): Promise<Record<string, unknown>> {
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: {
      totalNumbers: true,
      numberPrice: true,
      winnerValue: true,
      createdAt: true,
      closedAt: true,
      activationKind: true,
      activationAmount: true,
    },
  });
  if (!raffle) return {};
  const counts = await prisma.raffleNumber.groupBy({ by: ["status"], where: { raffleId }, _count: true });
  const count = (status: string) => counts.find((c) => c.status === status)?._count ?? 0;
  return {
    totalNumbers: raffle.totalNumbers,
    numberPrice: raffle.numberPrice,
    sold: count("occupied") + count("paid"),
    paid: count("paid"),
    winnerValue: raffle.winnerValue,
    activation: raffle.activationKind ? { kind: raffle.activationKind, amount: raffle.activationAmount } : null,
    createdAt: raffle.createdAt.toISOString(),
    closedAt: raffle.closedAt?.toISOString() ?? null,
  };
}

/** Sends a (closed) raffle to the trash. */
export async function trashRaffle(raffleId: string, actor: { name: string }): Promise<{ name: string; ownerId: string } | null> {
  const raffle = await prisma.raffle.findUnique({ where: { id: raffleId }, select: { name: true, ownerId: true, publicToken: true, deletedAt: true } });
  if (!raffle || raffle.deletedAt) return null;
  const details = await raffleRecord(raffleId);
  await prisma.raffle.update({
    where: { id: raffleId },
    data: { deletedAt: new Date(), deletedByName: actor.name, trashedPublicToken: raffle.publicToken, publicToken: null },
  });
  await logActivity({ ownerId: raffle.ownerId, actorName: actor.name, action: "raffle.trashed", targetName: raffle.name, details });
  return { name: raffle.name, ownerId: raffle.ownerId };
}

/** Brings a raffle back from the trash, with its public link when that link is still free. */
export async function restoreRaffle(raffleId: string, actor: { name: string }): Promise<{ name: string; ownerId: string } | null> {
  const raffle = await prisma.raffle.findUnique({ where: { id: raffleId }, select: { name: true, ownerId: true, deletedAt: true, trashedPublicToken: true } });
  if (!raffle || !raffle.deletedAt) return null;
  const tokenFree = raffle.trashedPublicToken
    ? (await prisma.raffle.count({ where: { publicToken: raffle.trashedPublicToken } })) === 0
    : false;
  await prisma.raffle.update({
    where: { id: raffleId },
    data: { deletedAt: null, deletedByName: null, trashedPublicToken: null, ...(tokenFree ? { publicToken: raffle.trashedPublicToken } : {}) },
  });
  await logActivity({ ownerId: raffle.ownerId, actorName: actor.name, action: "raffle.restored", targetName: raffle.name });
  return { name: raffle.name, ownerId: raffle.ownerId };
}

/** Purges what has been in the trash longer than TRASH_DAYS (from the sweeper). Returns how many. */
export async function purgeTrash(now = new Date()): Promise<number> {
  const due = await prisma.raffle.findMany({
    where: { deletedAt: { lt: new Date(now.getTime() - TRASH_DAYS * DAY_MS) } },
    select: { id: true, name: true, ownerId: true },
  });
  for (const raffle of due) {
    const details = await raffleRecord(raffle.id);
    await prisma.raffle.delete({ where: { id: raffle.id } }).catch(() => null);
    await logActivity({ ownerId: raffle.ownerId, actorName: "Ibirifas", action: "raffle.purged", targetName: raffle.name, details });
  }
  return due.length;
}
