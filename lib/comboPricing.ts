import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { comboSalePrices, parseCombos } from "@/lib/combos";
import { samePhone } from "@/lib/reservations";

type Db = Prisma.TransactionClient | typeof prisma;

/** Who a buyer is for combos: their phone when there is one (any format), else their name as typed. */
export interface BuyerKey {
  phone?: string | null;
  name?: string | null;
}

const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b) && a!.trim().toLocaleLowerCase("es") === b!.trim().toLocaleLowerCase("es");

/**
 * Combos count every number a buyer still owes in the raffle, not just the ones taken in one go: someone who
 * reserves the 18 and, a minute later, the 30 gets "2 por $8.000" like someone who took both at once. Re-prices the
 * buyer's unpaid loose numbers (lib/combos.ts) and stores each share in salePrice; with only one left, it goes back
 * to the number price. Paid numbers keep what was charged. Call it after a sale, a reservation or a release.
 */
export async function repriceBuyerCombos(db: Db, raffleId: string, buyer: BuyerKey): Promise<void> {
  const raffle = await db.raffle.findUnique({ where: { id: raffleId }, select: { numberPrice: true, combos: true } });
  const combos = parseCombos(raffle?.combos);
  if (!raffle || combos.length === 0 || (!buyer.phone && !buyer.name)) return;
  const owed = await db.raffleNumber.findMany({
    where: { raffleId, status: "occupied", groupId: null, quotas: { none: {} } },
    select: { id: true, buyerPhone: true, buyerName: true, salePrice: true },
    orderBy: { value: "asc" },
  });
  const mine = owed.filter((n) =>
    buyer.phone && n.buyerPhone ? samePhone(n.buyerPhone, buyer.phone) : sameName(n.buyerName, buyer.name),
  );
  const prices = mine.length > 1 ? comboSalePrices(mine.length, raffle.numberPrice, combos) : mine.map(() => null);
  for (const [i, n] of mine.entries()) {
    if (n.salePrice !== prices[i]) await db.raffleNumber.update({ where: { id: n.id }, data: { salePrice: prices[i] ?? null } });
  }
}

/** The same for every buyer among some numbers (e.g. the ones just freed, read before freeing them). */
export async function repriceBuyersOf(db: Db, raffleId: string, rows: { buyerPhone: string | null; buyerName: string | null }[]): Promise<void> {
  const seen = new Set<string>();
  for (const r of rows) {
    const key = r.buyerPhone ? `p:${r.buyerPhone.replace(/\D/g, "").slice(-10)}` : `n:${(r.buyerName ?? "").trim().toLocaleLowerCase("es")}`;
    if (seen.has(key) || (!r.buyerPhone && !r.buyerName)) continue;
    seen.add(key);
    await repriceBuyerCombos(db, raffleId, { phone: r.buyerPhone, name: r.buyerName });
  }
}

/**
 * Brings every open raffle with combos in line with the rule above (for numbers sold before it existed, or by
 * separate sales). Idempotent: run once when the server starts.
 */
export async function repriceAllCombos(): Promise<void> {
  const raffles = await prisma.raffle.findMany({
    where: { combos: { not: null }, status: "active", deletedAt: null },
    select: { id: true },
  });
  for (const r of raffles) {
    const owed = await prisma.raffleNumber.findMany({
      where: { raffleId: r.id, status: "occupied", groupId: null, quotas: { none: {} } },
      select: { buyerPhone: true, buyerName: true },
    });
    await repriceBuyersOf(prisma, r.id, owed);
  }
}
