"use client";

import { useState } from "react";
import { formatNumberValue } from "@/lib/format";

/** One lettered set while the raffle is being set up. `price` is the raw input text. */
export interface PlannerSet {
  label: string;
  price: string;
  values: number[];
}

interface GroupPlannerProps {
  total: number;
  /** How many numbers each set is meant to hold. */
  size: number;
  sets: PlannerSet[];
  mode: "random" | "manual";
  disabled?: boolean;
  onModeChange: (mode: "random" | "manual") => void;
  /** Deal every number into the sets again (random mode). */
  onRedraw: () => void;
  onSetsChange: (sets: PlannerSet[]) => void;
}

const INPUT =
  "h-10 w-full rounded-xl border border-line bg-bg-elevated px-3 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60";

/**
 * Decides which numbers go in which lettered set: dealt at random (and redealt
 * until it looks right) or picked by hand, tapping numbers onto the active letter.
 */
export function GroupPlanner({ total, size, sets, mode, disabled, onModeChange, onRedraw, onSetsChange }: GroupPlannerProps) {
  const [active, setActive] = useState(0);
  const activeIndex = Math.min(active, Math.max(0, sets.length - 1));

  const ownerOf = new Map<number, number>();
  sets.forEach((set, index) => set.values.forEach((v) => ownerOf.set(v, index)));

  const setPrice = (index: number, price: string) =>
    onSetsChange(sets.map((set, i) => (i === index ? { ...set, price } : set)));

  /** Tap a number: it goes to the active letter, leaves it if already there, or moves over from another letter. */
  const toggleNumber = (value: number) => {
    const owner = ownerOf.get(value);
    onSetsChange(
      sets.map((set, i) => {
        if (i === activeIndex) {
          return owner === i
            ? { ...set, values: set.values.filter((v) => v !== value) }
            : { ...set, values: [...set.values, value].sort((a, b) => a - b) };
        }
        return owner === i ? { ...set, values: set.values.filter((v) => v !== value) } : set;
      }),
    );
  };

  const looseCount = total - ownerOf.size;

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Cómo repartir los números" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-bg-elevated p-1">
        {(["random", "manual"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            disabled={disabled}
            onClick={() => onModeChange(m)}
            className={`h-10 rounded-lg text-sm font-semibold transition active:scale-[0.98] ${
              mode === m ? "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02]" : "text-text-muted"
            }`}
          >
            {m === "random" ? "Al azar" : "Elegirlos yo"}
          </button>
        ))}
      </div>

      {mode === "random" ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted">Se reparten al azar. Si no te gusta, vuelve a sortear.</p>
          <button
            type="button"
            onClick={onRedraw}
            disabled={disabled}
            className="h-10 shrink-0 rounded-xl border border-gold-600/50 px-4 text-sm font-semibold text-gold-400 transition active:scale-[0.98] disabled:opacity-60"
          >
            Sortear de nuevo
          </button>
        </div>
      ) : (
        <p className="text-xs text-text-muted">
          Elige una letra y toca los números que van en ella (de a {size}, más o menos). Tocar uno de otra letra lo pasa
          a la elegida.
        </p>
      )}

      <ul className="space-y-2">
        {sets.map((set, index) => {
          const isActive = mode === "manual" && index === activeIndex;
          return (
            <li
              key={set.label}
              className={`rounded-xl border p-2.5 ${isActive ? "border-gold-400 bg-gold-400/5" : "border-line bg-surface-2"}`}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  disabled={mode !== "manual" || disabled}
                  aria-label={`Elegir la letra ${set.label}`}
                  aria-pressed={isActive}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-[family-name:var(--font-heading)] text-lg font-extrabold ${
                    isActive || mode === "random"
                      ? "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02]"
                      : "border border-line bg-bg-elevated text-text-muted"
                  }`}
                >
                  {set.label}
                </button>
                <span className="w-14 shrink-0 text-xs text-text-muted">
                  {set.values.length}
                  {mode === "manual" ? `/${size}` : ""} núm.
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={set.price}
                  onChange={(e) => setPrice(index, e.target.value)}
                  placeholder="Precio"
                  aria-label={`Precio del conjunto ${set.label}`}
                  disabled={disabled}
                  className={INPUT}
                />
              </div>
              {mode === "random" && (
                <p className="mt-2 break-words text-xs leading-relaxed text-text-muted">
                  {set.values.map(formatNumberValue).join(" · ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {mode === "manual" && (
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10" aria-label="Números disponibles para repartir">
          {Array.from({ length: total }, (_, value) => {
            const owner = ownerOf.get(value);
            const mine = owner === activeIndex;
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleNumber(value)}
                disabled={disabled || sets.length === 0}
                aria-label={`Número ${formatNumberValue(value)}${owner === undefined ? ", suelto" : `, conjunto ${sets[owner]!.label}`}`}
                aria-pressed={mine}
                className={`relative flex aspect-square items-center justify-center rounded-lg text-xs font-bold transition active:scale-90 ${
                  mine
                    ? "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02]"
                    : owner !== undefined
                      ? "border border-line bg-surface-2 text-text-muted"
                      : "border border-dashed border-line text-text"
                }`}
              >
                {formatNumberValue(value)}
                {owner !== undefined && !mine && (
                  <span className="absolute -right-0.5 -top-0.5 rounded bg-bg-elevated px-0.5 text-[8px] font-extrabold leading-tight text-gold-400">
                    {sets[owner]!.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-text-muted" aria-live="polite">
        {looseCount > 0
          ? `${looseCount} ${looseCount === 1 ? "número queda suelto" : "números quedan sueltos"} y se ${looseCount === 1 ? "vende" : "venden"} de a uno.`
          : "Todos los números están en un conjunto."}
      </p>
    </div>
  );
}
