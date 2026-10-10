"use client";

import { useState } from "react";
import type { RaffleNumberDTO } from "@/lib/types";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { comboTotal, planText, type Combo } from "@/lib/combos";
import { BottomSheet } from "@/components/BottomSheet";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Spinner } from "@/components/Spinner";

interface SellManySheetProps {
  numbers: RaffleNumberDTO[];
  numberPrice: number;
  /** The raffle's combos: numbers sold together get the cheapest mix (lib/combos.ts). */
  combos?: Combo[];
  /** Names already used in this raffle — offered as suggestions so one buyer isn't typed two ways. */
  knownBuyers: string[];
  onClose: () => void;
  onConfirm: (input: { buyerName: string; buyerPhone: string | null; photoDataUrl: string | null }) => Promise<void>;
}

export function SellManySheet({ numbers, numberPrice, combos = [], knownBuyers, onClose, onConfirm }: SellManySheetProps) {
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const count = numbers.length;

  const handleConfirm = async () => {
    const name = buyerName.trim();
    if (!name) {
      setFormError("El nombre del comprador es obligatorio.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onConfirm({ buyerName: name, buyerPhone: buyerPhone.trim() || null, photoDataUrl });
    } catch {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      title={`Vender ${count} ${count === 1 ? "número" : "números"}`}
      subtitle={`${formatCurrency(comboTotal(count, numberPrice, combos))} en total${planText(count, numberPrice, combos) ? ` · ${planText(count, numberPrice, combos)}` : ""}`}
      onClose={onClose}
    >
      <div className="flex flex-wrap gap-2">
        {numbers.map((n) => (
          <span
            key={n.id}
            className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-2.5 font-[family-name:var(--font-heading)] text-base font-bold text-[#241a02]"
          >
            {formatNumberValue(n.value)}
          </span>
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="manyBuyerName" className="text-sm font-medium text-text-muted">
          Nombre del comprador <span className="text-gold-400">*</span>
        </label>
        <input
          id="manyBuyerName"
          type="text"
          list="known-buyers"
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          placeholder="Ej. María Pérez"
          autoComplete="off"
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400"
        />
        <datalist id="known-buyers">
          {knownBuyers.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="manyBuyerPhone" className="text-sm font-medium text-text-muted">
          Teléfono (opcional)
        </label>
        <input
          id="manyBuyerPhone"
          type="tel"
          inputMode="tel"
          value={buyerPhone}
          onChange={(e) => setBuyerPhone(e.target.value)}
          placeholder="Ej. 3001234567"
          autoComplete="tel"
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400"
        />
      </div>

      <PhotoPicker value={photoDataUrl} onChange={setPhotoDataUrl} onError={setFormError} />

      {formError && <p className="text-sm font-medium text-red-400">{formError}</p>}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={saving || buyerName.trim().length === 0}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? (
          <>
            <Spinner size={20} />
            Guardando…
          </>
        ) : (
          `Vender ${count} ${count === 1 ? "número" : "números"}`
        )}
      </button>
    </BottomSheet>
  );
}
