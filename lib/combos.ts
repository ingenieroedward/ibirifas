import { formatCurrency } from "@/lib/format";

/**
 * Combos: several loose numbers bought together cost less, e.g. "2 por $4.000" when one number is $2.500. The
 * organizer sets up to MAX_COMBOS of them on a raffle without sets or stages. When numbers are sold or reserved
 * together, the buyer gets the cheapest mix of combos and single numbers; each number of a combo stores its share
 * of the combo's price (RaffleNumber.salePrice), so every total (collected, owed, per seller, per buyer) adds up
 * what was really charged. Numbers sold one at a time keep the raffle's number price. Pure helpers shared by the
 * server and the screens.
 */

export interface Combo {
  /** How many numbers. */
  count: number;
  /** What they all cost together, in pesos. */
  price: number;
}

export const MAX_COMBOS = 3;
export const MAX_COMBO_COUNT = 50;

/** The combos stored on a raffle (JSON), cleaned: valid ones, once per size, smallest first. */
export function parseCombos(raw: string | null | undefined): Combo[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    const bySize = new Map<number, Combo>();
    for (const item of list) {
      const count = Number((item as { count?: unknown })?.count);
      const price = Number((item as { price?: unknown })?.price);
      if (Number.isInteger(count) && count >= 2 && count <= MAX_COMBO_COUNT && Number.isInteger(price) && price > 0) {
        bySize.set(count, { count, price });
      }
    }
    return [...bySize.values()].sort((a, b) => a.count - b.count).slice(0, MAX_COMBOS);
  } catch {
    return [];
  }
}

/** Why these combos can't be saved (null when they're fine): each one must be cheaper than buying the numbers apart. */
export function combosProblem(combos: Combo[], numberPrice: number): string | null {
  if (combos.length > MAX_COMBOS) return `Máximo ${MAX_COMBOS} combos.`;
  const sizes = new Set<number>();
  for (const c of combos) {
    if (!Number.isInteger(c.count) || c.count < 2 || c.count > MAX_COMBO_COUNT) return `Un combo lleva de 2 a ${MAX_COMBO_COUNT} números.`;
    if (!Number.isInteger(c.price) || c.price <= 0) return "Escribe el precio de cada combo.";
    if (sizes.has(c.count)) return `Hay dos combos de ${c.count} números.`;
    sizes.add(c.count);
    if (c.price >= c.count * numberPrice) {
      return `El combo de ${c.count} debe costar menos de ${formatCurrency(c.count * numberPrice)} (${c.count} números sueltos).`;
    }
  }
  return null;
}

/**
 * The cheapest way to buy `k` numbers: how many of each combo plus loose numbers, and the total. A list of the
 * group sizes in the order to hand them out (combos first, biggest first), then the loose ones.
 */
export function comboPlan(k: number, numberPrice: number, combos: Combo[]): { total: number; groups: { count: number; price: number | null }[] } {
  if (k <= 0) return { total: 0, groups: [] };
  // best[i] = cheapest price for i numbers; via[i] = the combo used last (null = one loose number).
  const best: number[] = [0];
  const via: (Combo | null)[] = [null];
  for (let i = 1; i <= k; i++) {
    best[i] = best[i - 1]! + numberPrice;
    via[i] = null;
    for (const c of combos) {
      if (c.count <= i && best[i - c.count]! + c.price < best[i]!) {
        best[i] = best[i - c.count]! + c.price;
        via[i] = c;
      }
    }
  }
  const used: Combo[] = [];
  let loose = 0;
  for (let i = k; i > 0; ) {
    const c = via[i];
    if (c) {
      used.push(c);
      i -= c.count;
    } else {
      loose++;
      i--;
    }
  }
  used.sort((a, b) => b.count - a.count);
  return {
    total: best[k]!,
    groups: [...used.map((c) => ({ count: c.count, price: c.price as number | null })), ...Array.from({ length: loose }, () => ({ count: 1, price: null }))],
  };
}

/** What `k` numbers bought together cost. */
export function comboTotal(k: number, numberPrice: number, combos: Combo[]): number {
  return comboPlan(k, numberPrice, combos).total;
}

/**
 * Each number's sale price when `k` numbers are sold together (in the order given): numbers in a combo get their
 * share of its price (the cents spread so they add up exactly), loose ones null (the raffle's number price).
 */
export function comboSalePrices(k: number, numberPrice: number, combos: Combo[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (const g of comboPlan(k, numberPrice, combos).groups) {
    if (g.price === null) {
      out.push(null);
      continue;
    }
    const base = Math.floor(g.price / g.count);
    const extra = g.price - base * g.count;
    for (let i = 0; i < g.count; i++) out.push(base + (i < extra ? 1 : 0));
  }
  return out;
}

/** How the combos read on screens and shared text: "2 por $4.000 · 5 por $9.000". */
export function combosLine(combos: Combo[]): string {
  return combos.map((c) => `${c.count} por ${formatCurrency(c.price)}`).join(" · ");
}

/** What a loose number counts for: its combo share when it went in one, else the raffle's number price. */
export function loosePrice(n: { salePrice?: number | null }, numberPrice: number): number {
  return n.salePrice ?? numberPrice;
}

/** "1 combo de 2 + 1 suelto", to explain a total. */
export function planText(k: number, numberPrice: number, combos: Combo[]): string | null {
  const groups = comboPlan(k, numberPrice, combos).groups;
  const comboCounts = new Map<number, number>();
  let loose = 0;
  for (const g of groups) {
    if (g.price === null) loose++;
    else comboCounts.set(g.count, (comboCounts.get(g.count) ?? 0) + 1);
  }
  if (comboCounts.size === 0) return null;
  const parts = [...comboCounts].map(([count, times]) => `${times} combo${times === 1 ? "" : "s"} de ${count}`);
  if (loose) parts.push(`${loose} suelto${loose === 1 ? "" : "s"}`);
  return parts.join(" + ");
}
