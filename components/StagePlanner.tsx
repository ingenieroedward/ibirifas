"use client";

import { formatCurrency } from "@/lib/format";
import { prizeAmount } from "@/lib/stages";
import type { FullPayPerk, RaffleDTO } from "@/lib/types";

/** One stage being edited in the form. */
export interface StageRow {
  key: string;
  /** Present for a stage that already exists (editing). */
  id?: string;
  label: string;
  prize: string;
  price: string;
  /** yyyy-mm-dd, or "". */
  drawDate: string;
  lottery: string;
  /** Already played: shown but not editable. */
  drawn: boolean;
}

/** Everything the planner edits. */
export interface StagePlan {
  rows: StageRow[];
  deadlineDays: string;
  perk: FullPayPerk;
  discount: string;
  bonus: { prize: string; drawDate: string; lottery: string; drawn: boolean };
}

export const MIN_STAGES = 2;
export const MAX_STAGES = 6;

let nextKey = 0;
export function newStageRow(position: number, source?: Partial<StageRow>): StageRow {
  nextKey += 1;
  return {
    key: `stage-${nextKey}`,
    label: source?.label ?? `Etapa ${position}`,
    prize: source?.prize ?? "",
    price: source?.price ?? "",
    drawDate: source?.drawDate ?? "",
    lottery: source?.lottery ?? "",
    drawn: source?.drawn ?? false,
    ...(source?.id ? { id: source.id } : {}),
  };
}

/** A fresh plan (three stages, three days to be up to date, no perk), or the one of an existing raffle. */
export function initialStagePlan(raffle?: RaffleDTO): StagePlan {
  const paid = raffle?.stages.filter((s) => !s.bonus) ?? [];
  const bonus = raffle?.stages.find((s) => s.bonus);
  return {
    rows:
      paid.length > 0
        ? paid.map((s, i) =>
            newStageRow(i + 1, {
              id: s.id,
              label: s.label,
              prize: s.prize,
              price: String(s.price),
              drawDate: s.drawDate ? s.drawDate.slice(0, 10) : "",
              lottery: s.lottery ?? "",
              drawn: Boolean(s.outcome),
            }),
          )
        : [newStageRow(1), newStageRow(2), newStageRow(3)],
    deadlineDays: String(raffle?.stageDeadlineDays ?? 3),
    perk: raffle?.fullPayPerk ?? "none",
    discount: raffle?.fullPayDiscount ? String(raffle.fullPayDiscount) : "",
    bonus: {
      prize: bonus?.prize ?? "",
      drawDate: bonus?.drawDate ? bonus.drawDate.slice(0, 10) : "",
      lottery: bonus?.lottery ?? "",
      drawn: Boolean(bonus?.outcome),
    },
  };
}

const inputClass =
  "h-11 w-full min-w-0 rounded-xl border border-line bg-bg-elevated px-3 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60";

/**
 * The stages of a raffle by stages: each stage is a draw with its own prize, date and lottery, and costs one
 * installment of the number's price. Shows the money math (what selling everything brings in against the prizes).
 * On edit (`fixedPrices`) installments can't change and stages can't be added or removed.
 */
export function StagePlanner({
  plan,
  onChange,
  totalNumbers,
  fixedPrices,
  disabled,
}: {
  plan: StagePlan;
  onChange: (plan: StagePlan) => void;
  totalNumbers: number;
  fixedPrices?: boolean;
  disabled?: boolean;
}) {
  const setRow = (key: string, patch: Partial<StageRow>) =>
    onChange({ ...plan, rows: plan.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });

  const prices = plan.rows.map((r) => Number(r.price));
  const pricesOk = prices.every((p) => Number.isInteger(p) && p > 0);
  const total = pricesOk ? prices.reduce((a, b) => a + b, 0) : 0;
  const prizeValues = [...plan.rows.map((r) => r.prize), ...(plan.perk === "draw" ? [plan.bonus.prize] : [])].map(prizeAmount);
  const prizeSum = prizeValues.reduce<number>((a, b) => a + (b ?? 0), 0);
  const nonCash = prizeValues.filter((v) => v === null).length;
  const revenue = total * (Number.isFinite(totalNumbers) ? totalNumbers : 0);
  const breakEven = total > 0 && prizeSum > 0 ? Math.ceil(prizeSum / total) : null;
  const discount = Number(plan.discount);

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {plan.rows.map((row, index) => (
          <li key={row.key} className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                value={row.label}
                onChange={(e) => setRow(row.key, { label: e.target.value })}
                disabled={disabled || row.drawn}
                aria-label={`Nombre de la etapa ${index + 1}`}
                maxLength={40}
                className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 text-sm font-semibold text-text outline-none focus:border-gold-400"
              />
              {row.drawn ? (
                <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-muted">Ya se jugó</span>
              ) : (
                !fixedPrices &&
                plan.rows.length > MIN_STAGES && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...plan, rows: plan.rows.filter((r) => r.key !== row.key) })}
                    disabled={disabled}
                    className="h-8 shrink-0 rounded-full border border-line px-3 text-xs font-semibold text-text-muted transition active:scale-95"
                  >
                    Quitar
                  </button>
                )
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0 space-y-1">
                <span className="text-xs text-text-muted">Premio *</span>
                <input
                  type="text"
                  value={row.prize}
                  onChange={(e) => setRow(row.key, { prize: e.target.value })}
                  disabled={disabled || row.drawn}
                  placeholder={index === plan.rows.length - 1 ? "Ej. $7.000.000" : "Ej. $500.000"}
                  maxLength={80}
                  className={inputClass}
                />
              </label>
              <label className="min-w-0 space-y-1">
                <span className="text-xs text-text-muted">Cuota {index + 1} *</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={row.price}
                  onChange={(e) => setRow(row.key, { price: e.target.value })}
                  disabled={disabled || fixedPrices}
                  placeholder="Ej. 50000"
                  className={inputClass}
                />
              </label>
              <label className="min-w-0 space-y-1">
                <span className="text-xs text-text-muted">Fecha del sorteo</span>
                <input
                  type="date"
                  value={row.drawDate}
                  onChange={(e) => setRow(row.key, { drawDate: e.target.value })}
                  disabled={disabled || row.drawn}
                  className={`${inputClass} max-w-full`}
                />
              </label>
              <label className="min-w-0 space-y-1">
                <span className="text-xs text-text-muted">Lotería</span>
                <input
                  type="text"
                  value={row.lottery}
                  onChange={(e) => setRow(row.key, { lottery: e.target.value })}
                  disabled={disabled || row.drawn}
                  placeholder="Ej. Sinuano Noche"
                  maxLength={80}
                  className={inputClass}
                />
              </label>
            </div>
          </li>
        ))}
      </ol>

      {!fixedPrices && plan.rows.length < MAX_STAGES && (
        <button
          type="button"
          onClick={() => onChange({ ...plan, rows: [...plan.rows, newStageRow(plan.rows.length + 1)] })}
          disabled={disabled}
          className="flex h-11 w-full items-center justify-center rounded-xl border border-dashed border-line text-sm font-semibold text-gold-400 transition active:scale-[0.98] disabled:opacity-60"
        >
          + Agregar etapa
        </button>
      )}
      {fixedPrices && (
        <p className="text-xs text-text-muted">
          Las cuotas y la cantidad de etapas no se pueden cambiar después de crear la rifa (ya puede haber cuotas pagadas).
        </p>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium text-text-muted">Días antes de cada sorteo para estar al día</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={30}
          step={1}
          value={plan.deadlineDays}
          onChange={(e) => onChange({ ...plan, deadlineDays: e.target.value })}
          disabled={disabled}
          className={inputClass}
        />
        <span className="block text-xs text-text-muted">
          Con 3 y un sorteo el día 10, las cuotas pagadas hasta el día 7 juegan. Si sale un número que no está al día, el premio
          queda en la casa.
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text-muted">Si paga todo de una vez</legend>
        {(
          [
            ["none", "Paga el total, sin beneficio"],
            ["discount", "Recibe un descuento"],
            ["draw", "Juega un sorteo extra gratis"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex cursor-pointer items-center gap-3 py-0.5">
            <input
              type="radio"
              name="fullPayPerk"
              value={value}
              checked={plan.perk === value}
              onChange={() => onChange({ ...plan, perk: value })}
              disabled={disabled || (plan.bonus.drawn && value !== "draw")}
              className="h-5 w-5 accent-[#f5c542]"
            />
            <span className="text-sm text-text">{label}</span>
          </label>
        ))}
        {plan.perk === "discount" && (
          <label className="block space-y-1 pt-1">
            <span className="text-xs text-text-muted">Descuento *</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={plan.discount}
              onChange={(e) => onChange({ ...plan, discount: e.target.value })}
              disabled={disabled}
              placeholder="Ej. 10000"
              className={inputClass}
            />
            <span className="block text-xs text-text-muted">
              {total > 0 && discount > 0 && discount < total
                ? `Paga ${formatCurrency(total - discount)} en vez de ${formatCurrency(total)}, si lo hace antes de la fecha límite de la primera etapa.`
                : "Se descuenta del total si paga todo junto antes de la fecha límite de la primera etapa."}
            </span>
          </label>
        )}
        {plan.perk === "draw" && (
          <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
            <p className="text-xs text-text-muted">
              Juegan solo los números pagados completos antes de la fecha límite de la primera etapa.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 min-w-0 space-y-1">
                <span className="text-xs text-text-muted">Premio del sorteo extra *</span>
                <input
                  type="text"
                  value={plan.bonus.prize}
                  onChange={(e) => onChange({ ...plan, bonus: { ...plan.bonus, prize: e.target.value } })}
                  disabled={disabled || plan.bonus.drawn}
                  placeholder="Ej. $300.000"
                  maxLength={80}
                  className={inputClass}
                />
              </label>
              <label className="min-w-0 space-y-1">
                <span className="text-xs text-text-muted">Fecha</span>
                <input
                  type="date"
                  value={plan.bonus.drawDate}
                  onChange={(e) => onChange({ ...plan, bonus: { ...plan.bonus, drawDate: e.target.value } })}
                  disabled={disabled || plan.bonus.drawn}
                  className={`${inputClass} max-w-full`}
                />
              </label>
              <label className="min-w-0 space-y-1">
                <span className="text-xs text-text-muted">Lotería</span>
                <input
                  type="text"
                  value={plan.bonus.lottery}
                  onChange={(e) => onChange({ ...plan, bonus: { ...plan.bonus, lottery: e.target.value } })}
                  disabled={disabled || plan.bonus.drawn}
                  maxLength={80}
                  className={inputClass}
                />
              </label>
            </div>
          </div>
        )}
      </fieldset>

      {total > 0 && (
        <div className="space-y-1 rounded-xl border border-gold-600/40 bg-gold-500/5 p-3 text-sm" aria-label="Cuentas de la rifa">
          <p className="flex justify-between gap-2 text-text">
            <span>Valor del número</span>
            <span className="font-semibold">
              {formatCurrency(total)} <span className="font-normal text-text-muted">({plan.rows.length} cuotas)</span>
            </span>
          </p>
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
                <span className={`font-semibold ${revenue - prizeSum < 0 ? "text-red-400" : "text-gold-400"}`}>
                  {formatCurrency(revenue - prizeSum)}
                </span>
              </p>
              {breakEven !== null && (
                <p className="text-xs text-text-muted">
                  {breakEven > totalNumbers
                    ? "Ni vendiendo todos los números alcanza para los premios."
                    : `Cubres los premios vendiendo ${breakEven} números pagados completos.`}
                </p>
              )}
            </>
          )}
          {nonCash > 0 && (
            <p className="text-xs text-text-muted">
              {nonCash === 1 ? "Un premio no es" : `${nonCash} premios no son`} una cantidad de dinero (ej. $500.000) y no se suma.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
