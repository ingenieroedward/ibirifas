/**
 * "Gana Más": extra prizes decided by the same official lottery result as the main prize. The raffle plays with the
 * result's last digits (two for 00–99, three for 000–999, one for 0–9); on top of the main prize the organizer can
 * add any of:
 *   - "reverse"   al revés: the main number's digits backwards (47 → 74);
 *   - "first"     the result's first digits (3847 → 38);
 *   - "neighbors" vecinos: the numbers right before and after the main one (47 → 46 and 48; 00 → 99 and 01).
 * A number can win several prizes (they add up: 33 is its own reverse). Extra prizes go only to numbers that are
 * paid; the main one follows the raffle's usual rule (sold). Pure helpers shared by the server and the screens.
 */

export type ExtraPrizeKind = "reverse" | "first" | "neighbors";
export type PrizeKind = "main" | ExtraPrizeKind;

export const EXTRA_PRIZE_KINDS: ExtraPrizeKind[] = ["reverse", "first", "neighbors"];

export interface ExtraPrize {
  kind: ExtraPrizeKind;
  /** What it pays, as the organizer wrote it ("$100.000", "Un mercado"). For neighbors, each one. */
  prize: string;
}

/** One prize of a played draw. `won`: someone takes it (otherwise it stays with the organizer). */
export interface PrizeWin {
  kind: PrizeKind;
  value: number;
  prize: string | null;
  won: boolean;
}

/** How many digits the raffle's numbers have, when its size works with lottery digits (10, 100, 1000); else null. */
export function prizeDigits(totalNumbers: number): number | null {
  return totalNumbers === 10 ? 1 : totalNumbers === 100 ? 2 : totalNumbers === 1000 ? 3 : null;
}

export function supportsExtraPrizes(totalNumbers: number): boolean {
  return prizeDigits(totalNumbers) !== null;
}

/** "Al revés", "Dos primeras", "Vecinos"… (or "Premio mayor"), for the screens. */
export function prizeKindLabel(kind: PrizeKind, digits: number | null): string {
  switch (kind) {
    case "main":
      return "Premio mayor";
    case "reverse":
      return "Al revés";
    case "first":
      return digits === 3 ? "Tres primeras" : digits === 1 ? "Primera cifra" : "Dos primeras";
    case "neighbors":
      return "Vecinos";
  }
}

/** One line on how each prize is decided, with the 3847 example. */
export function prizeKindHint(kind: ExtraPrizeKind, digits: number | null): string {
  const d = digits ?? 2;
  const example = "3847";
  const main = example.slice(-d);
  switch (kind) {
    case "reverse":
      return `El número del mayor al revés (si sale ${main}, gana el ${[...main].reverse().join("")}).`;
    case "first":
      return `Las ${d === 1 ? "primera cifra" : `${d === 3 ? "tres" : "dos"} primeras cifras`} del resultado de la lotería (en ${example}, el ${example.slice(0, d)}).`;
    case "neighbors":
      return `El número de antes y el de después del mayor (si sale ${main}, ganan el ${pad(Number(main) - 1, d)} y el ${pad(Number(main) + 1, d)}), cada uno.`;
  }
}

function pad(n: number, digits: number): string {
  const total = 10 ** digits;
  return String(((n % total) + total) % total).padStart(digits, "0");
}

/** The extra prizes stored on a raffle (JSON), cleaned: known kinds, once each, in the canonical order. */
export function parseExtraPrizes(raw: string | null | undefined): ExtraPrize[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    const byKind = new Map<ExtraPrizeKind, ExtraPrize>();
    for (const item of list) {
      const kind = (item as { kind?: unknown })?.kind;
      const prize = (item as { prize?: unknown })?.prize;
      if (EXTRA_PRIZE_KINDS.includes(kind as ExtraPrizeKind) && typeof prize === "string" && prize.trim()) {
        byKind.set(kind as ExtraPrizeKind, { kind: kind as ExtraPrizeKind, prize: prize.trim() });
      }
    }
    return EXTRA_PRIZE_KINDS.filter((k) => byKind.has(k)).map((k) => byKind.get(k)!);
  } catch {
    return [];
  }
}

export function parsePrizeWins(raw: string | null | undefined): PrizeWin[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? (list as PrizeWin[]).filter((w) => typeof w?.value === "number" && typeof w?.kind === "string") : [];
  } catch {
    return [];
  }
}

/** The result's digits ("38-47" → "3847"), or null when it has fewer than the raffle plays with. */
export function resultDigits(result: string, digits: number): string | null {
  const only = result.replace(/\D/g, "");
  return only.length >= digits && only.length <= 8 ? only : null;
}

/**
 * Every prize of a draw from the lottery's result. `statusOf` tells a number's state ("available", "occupied",
 * "paid"). Returns null when the result can't be used (too short, or the raffle's size has no lottery digits).
 */
export function computeDraw(
  result: string,
  totalNumbers: number,
  mainPrize: string | null,
  extras: ExtraPrize[],
  statusOf: (value: number) => string | undefined,
): { winnerValue: number; wins: PrizeWin[] } | null {
  const digits = prizeDigits(totalNumbers);
  if (digits === null) return null;
  const only = resultDigits(result, digits);
  if (!only) return null;
  const main = Number(only.slice(-digits));
  const sold = (v: number) => {
    const s = statusOf(v);
    return s !== undefined && s !== "available";
  };
  const paid = (v: number) => statusOf(v) === "paid";
  const wins: PrizeWin[] = [{ kind: "main", value: main, prize: mainPrize, won: sold(main) }];
  for (const extra of extras) {
    const values =
      extra.kind === "reverse"
        ? [Number([...only.slice(-digits)].reverse().join(""))]
        : extra.kind === "first"
          ? [Number(only.slice(0, digits))]
          : [(main - 1 + totalNumbers) % totalNumbers, (main + 1) % totalNumbers];
    for (const value of values) wins.push({ kind: extra.kind, value, prize: extra.prize, won: paid(value) });
  }
  return { winnerValue: main, wins };
}

/** "Al revés $100.000 · Dos primeras $100.000 · Vecinos $20.000 c/u", for the screens and the share image. */
export function extraPrizesLine(extras: ExtraPrize[], totalNumbers: number): string {
  const digits = prizeDigits(totalNumbers);
  return extras.map((e) => `${prizeKindLabel(e.kind, digits)} ${e.prize}${e.kind === "neighbors" ? " c/u" : ""}`).join(" · ");
}
