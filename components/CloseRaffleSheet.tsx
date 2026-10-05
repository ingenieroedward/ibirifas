"use client";

import { useState } from "react";
import type { RaffleDTO } from "@/lib/types";
import { formatNumberValue } from "@/lib/format";
import { computeDraw, prizeDigits, prizeKindLabel } from "@/lib/prizes";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";

interface CloseRaffleSheetProps {
  raffle: RaffleDTO;
  onClose: () => void;
  /** `winnerValue` null closes the raffle without a draw; "Gana Más" raffles close with the lottery's result. */
  onConfirm: (close: { winnerValue: number | null } | { lotteryResult: string }) => Promise<void>;
}

/** Who holds a number, in words — so the organizer sees the winner before closing. */
export function describeHolder(raffle: Pick<RaffleDTO, "numbers" | "groups">, value: number): string {
  const number = raffle.numbers.find((n) => n.value === value);
  if (!number) return "Ese número no existe en esta rifa.";
  if (number.status === "available") return "Nadie lo compró: sigue disponible.";
  const set = number.groupId ? raffle.groups.find((g) => g.id === number.groupId) : null;
  const who = number.buyerName ?? "Sin nombre";
  const paid = number.status === "paid" ? "pagado" : "sin pagar";
  return `${who}${set ? ` · conjunto ${set.label}` : ""} · ${paid}`;
}

export function CloseRaffleSheet({ raffle, onClose, onConfirm }: CloseRaffleSheetProps) {
  if (raffle.extraPrizes.length > 0) return <CloseWithResultSheet raffle={raffle} onClose={onClose} onConfirm={onConfirm} />;
  return <CloseWithWinnerSheet raffle={raffle} onClose={onClose} onConfirm={onConfirm} />;
}

function CloseWithWinnerSheet({ raffle, onClose, onConfirm }: CloseRaffleSheetProps) {
  const [winner, setWinner] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = winner.trim();
  const value = digits === "" ? null : Number(digits);
  const invalid = value !== null && (!Number.isInteger(value) || value < 0 || value >= raffle.totalNumbers);
  const pending = raffle.numbers.filter((n) => n.status === "occupied").length;

  const handleConfirm = async () => {
    if (invalid) {
      setError(`El número ganador debe estar entre 00 y ${formatNumberValue(raffle.totalNumbers - 1)}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(value === null ? { winnerValue: null } : { winnerValue: value });
    } catch {
      setSaving(false);
    }
  };

  return (
    <BottomSheet title="Cerrar la rifa" subtitle={raffle.name} onClose={saving ? () => {} : onClose}>
      <div className="space-y-1.5">
        <label htmlFor="winnerValue" className="text-sm font-medium text-text-muted">
          Número ganador
          {raffle.lottery ? ` (según ${raffle.lottery})` : ""}
        </label>
        <input
          id="winnerValue"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={winner}
          onChange={(e) => setWinner(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder={`Ej. ${formatNumberValue(Math.min(47, raffle.totalNumbers - 1))}`}
          disabled={saving}
          autoComplete="off"
          className="h-14 w-full rounded-xl border border-line bg-surface-2 px-4 text-center font-[family-name:var(--font-heading)] text-3xl font-extrabold text-gold-400 outline-none focus:border-gold-400 disabled:opacity-60"
        />
        {value !== null && !invalid && (
          <p role="status" className="text-sm font-medium text-text">
            {describeHolder(raffle, value)}
          </p>
        )}
        {invalid && <p className="text-sm font-medium text-red-400">Ese número no existe en esta rifa.</p>}
        <p className="text-xs text-text-muted">Déjalo vacío si la rifa termina sin sorteo.</p>
      </div>

      <div className="space-y-1 rounded-2xl border border-line bg-surface-2 p-4 text-sm text-text-muted">
        <p>Al cerrarla ya no se podrán vender ni liberar números. Sí seguirás registrando pagos.</p>
        {pending > 0 && (
          <p className="font-medium text-gold-400">
            Ojo: quedan {pending} {pending === 1 ? "número vendido sin pagar" : "números vendidos sin pagar"}.
          </p>
        )}
        <p>Puedes reabrirla si te equivocas.</p>
      </div>

      {error && <p className="text-sm font-medium text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={saving || invalid}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? (
          <>
            <Spinner size={20} />
            Cerrando…
          </>
        ) : value === null ? (
          "Cerrar sin ganador"
        ) : (
          "Cerrar y registrar ganador"
        )}
      </button>
    </BottomSheet>
  );
}

/**
 * "Gana Más": the organizer types the lottery's full result and sees, before closing, every prize it gives — the
 * number, who has it and whether it pays (extra prizes need a paid number) or stays with the organizer.
 */
function CloseWithResultSheet({ raffle, onClose, onConfirm }: CloseRaffleSheetProps) {
  const [result, setResult] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = prizeDigits(raffle.totalNumbers) ?? 2;
  const statusByValue = new Map(raffle.numbers.map((n) => [n.value, n.status]));
  const draw = result ? computeDraw(result, raffle.totalNumbers, raffle.prizeLabel, raffle.extraPrizes, (v) => statusByValue.get(v)) : null;
  const pending = raffle.numbers.filter((n) => n.status === "occupied").length;

  const handleConfirm = async () => {
    if (result && !draw) {
      setError(`Escribe el resultado de la lotería con al menos ${digits} cifras.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(result ? { lotteryResult: result } : { winnerValue: null });
    } catch {
      setSaving(false);
    }
  };

  return (
    <BottomSheet title="Cerrar la rifa" subtitle={raffle.name} onClose={saving ? () => {} : onClose}>
      <div className="space-y-1.5">
        <label htmlFor="lotteryResult" className="text-sm font-medium text-text-muted">
          Resultado de la lotería{raffle.lottery ? ` (${raffle.lottery})` : ""}
        </label>
        <input
          id="lotteryResult"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={result}
          onChange={(e) => setResult(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="Ej. 3847"
          disabled={saving}
          autoComplete="off"
          className="h-14 w-full rounded-xl border border-line bg-surface-2 px-4 text-center font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-widest text-gold-400 outline-none focus:border-gold-400 disabled:opacity-60"
        />
        <p className="text-xs text-text-muted">
          Escribe el número completo que dio la lotería (todas las cifras). La rifa juega con las {digits === 1 ? "última" : digits === 3 ? "tres últimas" : "dos últimas"}.
          Déjalo vacío si termina sin sorteo.
        </p>
      </div>

      {draw && (
        <ul className="space-y-2" aria-label="Ganadores">
          {draw.wins.map((w, i) => (
            <li
              key={`${w.kind}-${w.value}-${i}`}
              className={`flex items-center gap-3 rounded-xl border p-3 ${w.won ? "border-gold-600/50 bg-gold-400/10" : "border-line bg-surface-2"}`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-gold-300 to-gold-500 font-[family-name:var(--font-heading)] text-lg font-extrabold text-[#241a02]">
                {formatNumberValue(w.value)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text">
                  {prizeKindLabel(w.kind, digits)}
                  {w.prize ? <span className="font-normal text-text-muted"> · {w.prize}</span> : null}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {w.won
                    ? describeHolder(raffle, w.value)
                    : statusByValue.get(w.value) === "occupied"
                      ? `${describeHolder(raffle, w.value)}: queda en la casa`
                      : "Nadie lo tenía: queda en la casa"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {result && !draw && <p className="text-sm font-medium text-red-400">Faltan cifras: escribe al menos {digits}.</p>}

      <div className="space-y-1 rounded-2xl border border-line bg-surface-2 p-4 text-sm text-text-muted">
        <p>Al cerrarla ya no se podrán vender ni liberar números. Sí seguirás registrando pagos.</p>
        {pending > 0 && (
          <p className="font-medium text-gold-400">
            Ojo: quedan {pending} {pending === 1 ? "número vendido sin pagar" : "números vendidos sin pagar"}, que no ganan premios adicionales.
          </p>
        )}
        <p>Puedes reabrirla si te equivocas.</p>
      </div>

      {error && <p className="text-sm font-medium text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={saving || Boolean(result && !draw)}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? (
          <>
            <Spinner size={20} />
            Cerrando…
          </>
        ) : result ? (
          "Cerrar y registrar ganadores"
        ) : (
          "Cerrar sin sorteo"
        )}
      </button>
    </BottomSheet>
  );
}
