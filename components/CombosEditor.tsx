"use client";

import { combosProblem, MAX_COMBOS, type Combo } from "@/lib/combos";
import { formatCurrency } from "@/lib/format";

export interface ComboDraft {
  count: string;
  price: string;
}

export function draftFromCombos(combos: Combo[] | undefined): ComboDraft[] {
  return (combos ?? []).map((c) => ({ count: String(c.count), price: String(c.price) }));
}

export function combosFromDraft(draft: ComboDraft[]): Combo[] {
  return draft
    .filter((d) => d.count.trim() && d.price.trim())
    .map((d) => ({ count: Math.round(Number(d.count)), price: Math.round(Number(d.price)) }));
}

/** Why the combos as typed can't be saved, for the form (null when fine or empty). */
export function comboDraftProblem(draft: ComboDraft[], numberPrice: number): string | null {
  const half = draft.find((d) => Boolean(d.count.trim()) !== Boolean(d.price.trim()));
  if (half) return "Completa cuántos números y el precio de cada combo (o quítalo).";
  const combos = combosFromDraft(draft);
  if (combos.length === 0) return null;
  if (!(numberPrice > 0)) return "Escribe primero el valor por número.";
  return combosProblem(combos, numberPrice);
}

/**
 * Combos: "2 números por $4.000" and the like (lib/combos.ts). Up to MAX_COMBOS; each must be cheaper than buying
 * its numbers apart. When someone takes several numbers together they get the cheapest mix on their own.
 */
export function CombosEditor({
  numberPrice,
  value,
  onChange,
  disabled,
}: {
  numberPrice: number;
  value: ComboDraft[];
  onChange: (next: ComboDraft[]) => void;
  disabled?: boolean;
}) {
  const set = (i: number, patch: Partial<ComboDraft>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const problem = comboDraftProblem(value, numberPrice);
  const on = value.length > 0;

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          id="useCombos"
          type="checkbox"
          checked={on}
          onChange={(e) =>
            onChange(e.target.checked ? [{ count: "2", price: numberPrice > 0 ? String(Math.round((numberPrice * 2 * 0.8) / 100) * 100) : "" }] : [])
          }
          disabled={disabled}
          className="mt-1 h-5 w-5 accent-[#f5c542]"
        />
        <span>
          <span className="block text-sm font-semibold text-text">Combos (varios números por menos)</span>
          <span className="mt-0.5 block text-xs text-text-muted">
            Ej. 2 números por $4.000. Cuando alguien lleva varios juntos, se le cobra solo la combinación más barata.
          </span>
        </span>
      </label>

      {on && (
        <div className="space-y-2">
          {value.map((d, i) => {
            const count = Number(d.count);
            const price = Number(d.price);
            const apart = count > 0 && numberPrice > 0 ? count * numberPrice : 0;
            const saving = apart > 0 && price > 0 && price < apart ? apart - price : 0;
            return (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={50}
                  value={d.count}
                  onChange={(e) => set(i, { count: e.target.value })}
                  aria-label={`Números del combo ${i + 1}`}
                  disabled={disabled}
                  className="h-11 w-16 rounded-xl border border-line bg-surface-2 px-2 text-center text-base text-text outline-none focus:border-gold-400"
                />
                <span className="shrink-0 text-sm text-text-muted">números por</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={d.price}
                  onChange={(e) => set(i, { price: e.target.value })}
                  placeholder="4000"
                  aria-label={`Precio del combo ${i + 1}`}
                  disabled={disabled}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-base text-text outline-none focus:border-gold-400"
                />
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label={`Quitar el combo ${i + 1}`}
                  disabled={disabled}
                  className="h-11 w-11 shrink-0 rounded-xl border border-line text-lg text-text-muted"
                >
                  ×
                </button>
                {saving > 0 && <span className="sr-only">Ahorra {formatCurrency(saving)}</span>}
              </div>
            );
          })}
          {value.length < MAX_COMBOS && (
            <button
              type="button"
              onClick={() => onChange([...value, { count: "", price: "" }])}
              disabled={disabled}
              className="text-sm font-semibold text-gold-400 underline-offset-2 hover:underline"
            >
              + Agregar otro combo
            </button>
          )}
          {problem ? (
            <p role="alert" className="text-xs font-medium text-red-400">
              {problem}
            </p>
          ) : (
            numberPrice > 0 && (
              <p className="text-xs text-text-muted">
                {combosFromDraft(value)
                  .map((c) => `${c.count} por ${formatCurrency(c.price)} (en vez de ${formatCurrency(c.count * numberPrice)})`)
                  .join(" · ")}
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
