import type { RaffleNumberDTO } from "@/lib/types";

export interface SellerSales {
  /** The seller's id; null for sales nobody is credited with (registered before this was tracked, or the seller was deleted). */
  id: string | null;
  name: string;
  /** Numbers sold, and how many of them belong to whole sets. */
  numbers: number;
  /** Whole sets sold (each counted once). */
  sets: number;
  /** Worth of everything sold, sets at their set price. */
  sold: number;
  /** Of that, what is already paid. */
  collected: number;
  /** Of that, what is still owed. */
  pending: number;
}

/**
 * How much each person sold and how much of it has been paid, to settle
 * commissions. A sale belongs to whoever sold it, whoever ended up collecting
 * the money. Biggest seller first; the no-owner bucket, when present, goes last.
 */
export function salesBySeller(
  numbers: RaffleNumberDTO[],
  priceOf: (subset: RaffleNumberDTO[]) => number,
): SellerSales[] {
  const buckets = new Map<string, { id: string | null; name: string; rows: RaffleNumberDTO[] }>();
  for (const n of numbers) {
    if (n.status === "available") continue;
    // Reservations made by visitors of the public link have no seller: they get their own line.
    const key = n.soldById ?? (n.online ? "online" : "");
    const bucket = buckets.get(key) ?? {
      id: n.soldById,
      name: n.soldByName ?? (n.online ? "Reservas en línea" : "Sin vendedor registrado"),
      rows: [],
    };
    bucket.rows.push(n);
    buckets.set(key, bucket);
  }

  const out: SellerSales[] = [...buckets.values()].map(({ id, name, rows }) => {
    const paid = rows.filter((n) => n.status === "paid");
    const owed = rows.filter((n) => n.status !== "paid");
    return {
      id,
      name,
      numbers: rows.length,
      sets: new Set(rows.map((n) => n.groupId).filter((g): g is string => g !== null)).size,
      sold: priceOf(rows),
      collected: priceOf(paid),
      pending: priceOf(owed),
    };
  });

  out.sort((a, b) => {
    if ((a.id === null) !== (b.id === null)) return a.id === null ? 1 : -1;
    return b.sold - a.sold || a.name.localeCompare(b.name, "es");
  });
  return out;
}

export function sumSales(rows: SellerSales[]): Omit<SellerSales, "id" | "name"> {
  return rows.reduce(
    (t, r) => ({
      numbers: t.numbers + r.numbers,
      sets: t.sets + r.sets,
      sold: t.sold + r.sold,
      collected: t.collected + r.collected,
      pending: t.pending + r.pending,
    }),
    { numbers: 0, sets: 0, sold: 0, collected: 0, pending: 0 },
  );
}

/** Commission on what has actually been collected, rounded to whole pesos. */
export function commissionOn(collected: number, percent: number): number {
  return Math.round((collected * percent) / 100);
}
