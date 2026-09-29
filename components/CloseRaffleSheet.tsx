"use client";

import { useState } from "react";
import type { RaffleDTO } from "@/lib/types";
import { formatNumberValue } from "@/lib/format";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";

interface CloseRaffleSheetProps {
  raffle: RaffleDTO;
  onClose: () => void;
  /** `winnerValue` null closes the raffle without a draw. */
  onConfirm: (winnerValue: number | null) => Promise<void>;
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
      await onConfirm(value);
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
