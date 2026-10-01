"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";

interface DeleteRaffleSheetProps {
  raffleName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  /** Download the raffle as Excel before it's gone. */
  onExport?: () => void;
  exporting?: boolean;
}

/** Deleting a raffle is permanent, so it asks for the raffle's name first. */
export function DeleteRaffleSheet({ raffleName, onClose, onConfirm, onExport, exporting = false }: DeleteRaffleSheetProps) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const matches = typed.trim().toLowerCase() === raffleName.trim().toLowerCase();

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <BottomSheet title="Eliminar la rifa" subtitle={raffleName} onClose={deleting ? () => {} : onClose}>
      <div className="space-y-1 rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">
        <p className="font-semibold">Esto no se puede deshacer.</p>
        <p>Se borran la rifa, todos sus números, los compradores, los pagos y los comprobantes.</p>
      </div>

      {onExport && (
        <button
          type="button"
          onClick={onExport}
          disabled={exporting || deleting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-green-500/40 text-sm font-semibold text-green-400 transition active:scale-[0.98] disabled:opacity-60"
        >
          {exporting ? <Spinner size={16} /> : "Descargar el Excel antes de eliminar"}
        </button>
      )}

      <div className="space-y-1.5">
        <label htmlFor="confirmRaffleName" className="text-sm font-medium text-text-muted">
          Para confirmar, escribe el nombre de la rifa
        </label>
        <input
          id="confirmRaffleName"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={raffleName}
          disabled={deleting}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-red-400 disabled:opacity-60"
        />
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={!matches || deleting}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 text-base font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {deleting ? (
          <>
            <Spinner size={20} />
            Eliminando…
          </>
        ) : (
          "Eliminar para siempre"
        )}
      </button>
    </BottomSheet>
  );
}
