"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";

interface DrawDateSheetProps {
  raffleName: string;
  /** The date already set, as an ISO string, or null. */
  current: string | null;
  onClose: () => void;
  /** Saves the day (an ISO string at UTC midnight, as the raffle form does) or clears it. */
  onSave: (isoDate: string | null) => Promise<void>;
}

/** A quick way to set the draw date from the board, e.g. right after a "when full" raffle fills up. */
export function DrawDateSheet({ raffleName, current, onClose, onSave }: DrawDateSheetProps) {
  const [day, setDay] = useState(current ? current.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!day) return setError("Elige el día del sorteo.");
    setSaving(true);
    setError(null);
    try {
      await onSave(new Date(day).toISOString());
    } catch {
      setError("No se pudo guardar la fecha. Inténtalo de nuevo.");
      setSaving(false);
    }
  };

  return (
    <BottomSheet title="Fecha del sorteo" subtitle={raffleName} onClose={saving ? () => {} : onClose}>
      <div className="space-y-1.5">
        <label htmlFor="drawDateQuick" className="text-sm font-medium text-text-muted">
          ¿Qué día se juega?
        </label>
        <input
          id="drawDateQuick"
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          disabled={saving}
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-400">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-on-accent shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? (
          <>
            <Spinner size={20} />
            Guardando…
          </>
        ) : (
          "Guardar fecha"
        )}
      </button>
    </BottomSheet>
  );
}
