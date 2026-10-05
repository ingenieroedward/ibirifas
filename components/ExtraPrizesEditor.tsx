"use client";

import { formatCurrency } from "@/lib/format";
import { EXTRA_PRIZE_KINDS, prizeDigits, prizeKindHint, prizeKindLabel, type ExtraPrize, type ExtraPrizeKind } from "@/lib/prizes";
import { prizeAmount } from "@/lib/stages";

export type ExtraPrizeDraft = Record<ExtraPrizeKind, { on: boolean; prize: string }>;

export function draftFromPrizes(prizes: ExtraPrize[] | undefined): ExtraPrizeDraft {
  const draft = { reverse: { on: false, prize: "" }, first: { on: false, prize: "" }, neighbors: { on: false, prize: "" } };
  for (const p of prizes ?? []) draft[p.kind] = { on: true, prize: p.prize };
  return draft;
}

export function prizesFromDraft(draft: ExtraPrizeDraft): ExtraPrize[] {
  return EXTRA_PRIZE_KINDS.filter((k) => draft[k].on && draft[k].prize.trim()).map((k) => ({ kind: k, prize: draft[k].prize.trim() }));
}

/**
 * "Gana Más": the extra prizes the same lottery result decides (al revés, primeras cifras, vecinos), each with its
 * prize, and the money math against what the raffle brings in.
 */
export function ExtraPrizesEditor({
  totalNumbers,
  numberPrice,
  mainPrize,
  value,
  onChange,
  disabled,
}: {
  totalNumbers: number;
  numberPrice: number;
  mainPrize: string;
  value: ExtraPrizeDraft;
  onChange: (next: ExtraPrizeDraft) => void;
  disabled?: boolean;
}) {
  const digits = prizeDigits(totalNumbers);
  const anyOn = EXTRA_PRIZE_KINDS.some((k) => value[k].on);
  const set = (kind: ExtraPrizeKind, patch: Partial<{ on: boolean; prize: string }>) => onChange({ ...value, [kind]: { ...value[kind], ...patch } });

  const lines = [
    { label: "Premio mayor", amount: prizeAmount(mainPrize), times: 1, on: true },
    ...EXTRA_PRIZE_KINDS.map((k) => ({ label: prizeKindLabel(k, digits), amount: prizeAmount(value[k].prize), times: k === "neighbors" ? 2 : 1, on: value[k].on })),
  ].filter((l) => l.on);
  const prizeSum = lines.reduce((sum, l) => sum + (l.amount ?? 0) * l.times, 0);
  const nonCash = lines.filter((l) => l.amount === null).length;
  const revenue = Number.isFinite(numberPrice) && numberPrice > 0 ? numberPrice * totalNumbers : 0;

  return (
    <div className="space-y-3 rounded-2xl border border-gold-600/40 bg-gold-500/5 p-4">
      <div>
        <p className="text-sm font-semibold text-text">Gana Más: premios adicionales (opcional)</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Con el mismo resultado de la lotería ganan más personas. Al cerrar escribes el resultado completo (ej. 3847) y la app
          saca sola todos los ganadores. Los premios adicionales solo los gana un número pagado.
        </p>
      </div>

      {digits === null ? (
        <p className="text-xs text-text-muted">Disponible en rifas de 10, 100 o 1.000 números.</p>
      ) : (
        <>
          {EXTRA_PRIZE_KINDS.map((kind) => (
            <div key={kind} className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={value[kind].on}
                  onChange={(e) => set(kind, { on: e.target.checked })}
                  disabled={disabled}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#f5c542]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">{prizeKindLabel(kind, digits)}</span>
                  <span className="block text-xs text-text-muted">{prizeKindHint(kind, digits)}</span>
                </span>
              </label>
              {value[kind].on && (
                <input
                  type="text"
                  value={value[kind].prize}
                  onChange={(e) => set(kind, { prize: e.target.value })}
                  placeholder={kind === "neighbors" ? "Premio de cada uno, ej. $20.000" : "Premio, ej. $100.000"}
                  aria-label={`Premio: ${prizeKindLabel(kind, digits)}`}
                  maxLength={80}
                  disabled={disabled}
                  className="h-11 w-full rounded-xl border border-line bg-bg-elevated px-3 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
                />
              )}
            </div>
          ))}

          {anyOn && revenue > 0 && (
            <div className="space-y-1 rounded-xl border border-gold-600/40 bg-bg-elevated p-3 text-sm" aria-label="Cuentas de los premios">
              <p className="flex justify-between gap-2 text-text">
                <span>Si vendes los {totalNumbers}</span>
                <span className="font-semibold">{formatCurrency(revenue)}</span>
              </p>
              {prizeSum > 0 && (
                <>
                  <p className="flex justify-between gap-2 text-text">
                    <span>Premios en dinero</span>
                    <span className="font-semibold">{formatCurrency(prizeSum)}</span>
                  </p>
                  <p className="flex justify-between gap-2 text-text">
                    <span>Queda para ti</span>
                    <span className={`font-semibold ${revenue - prizeSum < 0 ? "text-red-400" : "text-gold-400"}`}>{formatCurrency(revenue - prizeSum)}</span>
                  </p>
                </>
              )}
              {nonCash > 0 && (
                <p className="text-xs text-text-muted">
                  {nonCash === 1 ? "Un premio no es" : `${nonCash} premios no son`} una cantidad de dinero (ej. $100.000) y no se suma.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
