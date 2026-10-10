import { randomBelow } from "@/lib/accessCode";
import type { RaffleDTO, RaffleGroupDTO, RaffleNumberDTO } from "@/lib/types";

/** Sets are lettered A-Z, so a raffle has at most 26. */
export const MAX_GROUPS = 26;

export const GROUP_LABELS = Array.from({ length: MAX_GROUPS }, (_, i) => String.fromCharCode(65 + i));

/** Fisher-Yates with crypto randomness: every ordering equally likely. */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Deal `total` numbers (0..total-1) into `count` sets of `size` at random.
 * Whatever doesn't fit (count * size < total) is simply left loose.
 * Returns the numbers of each set, sorted, in letter order.
 */
export function drawRandomSets(total: number, size: number, count: number): number[][] {
  const deck = shuffled(Array.from({ length: total }, (_, i) => i));
  return Array.from({ length: count }, (_, g) => deck.slice(g * size, (g + 1) * size).sort((a, b) => a - b));
}

/** How many complete sets of `size` fit in `total` numbers (capped at 26). */
export function setsThatFit(total: number, size: number): number {
  if (!Number.isInteger(total) || !Number.isInteger(size) || size < 1) return 0;
  return Math.min(MAX_GROUPS, Math.floor(total / size));
}

type PricedRaffle = Pick<RaffleDTO, "numberPrice" | "groups" | "numbers">;

/**
 * Worth of a bunch of numbers: loose ones at the raffle's number price (or their combo share), and
 * numbers of a set at that set's price (sets are always sold whole, so a set's
 * numbers together are exactly its price).
 */
export function makePricer(raffle: PricedRaffle): (subset: Pick<RaffleNumberDTO, "groupId" | "salePrice">[]) => number {
  const price = new Map(raffle.groups.map((g) => [g.id, g.price]));
  const size = new Map<string, number>();
  for (const n of raffle.numbers) if (n.groupId) size.set(n.groupId, (size.get(n.groupId) ?? 0) + 1);

  return (subset) => {
    let total = 0;
    const perGroup = new Map<string, number>();
    for (const n of subset) {
      // A loose number sold in a combo counts its share of the combo (lib/combos.ts).
      if (!n.groupId) total += n.salePrice ?? raffle.numberPrice;
      else perGroup.set(n.groupId, (perGroup.get(n.groupId) ?? 0) + 1);
    }
    for (const [id, count] of perGroup) {
      total += Math.round(((price.get(id) ?? 0) * count) / (size.get(id) ?? count));
    }
    return total;
  };
}

/** The numbers of one set, ordered by value. */
export function numbersOfGroup(numbers: RaffleNumberDTO[], groupId: string): RaffleNumberDTO[] {
  return numbers.filter((n) => n.groupId === groupId).sort((a, b) => a.value - b.value);
}

/** available / occupied / paid for a whole set (they only ever change together). */
export function groupStatus(members: RaffleNumberDTO[]): RaffleNumberDTO["status"] {
  if (members.length > 0 && members.every((n) => n.status === "paid")) return "paid";
  if (members.some((n) => n.status !== "available")) return "occupied";
  return "available";
}

export function groupLabelOf(groups: RaffleGroupDTO[], groupId: string | null): string | null {
  return groupId ? (groups.find((g) => g.id === groupId)?.label ?? null) : null;
}
