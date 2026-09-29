"use client";

import { useState } from "react";
import type { PaymentMethod, RaffleNumberDTO } from "@/lib/types";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/payment";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";

interface PayManySheetProps {
  buyerName: string;
  /** The buyer's numbers that are still unpaid. */
  numbers: RaffleNumberDTO[];
  numberPrice: number;
  onClose: () => void;
  onConfirm: (method: PaymentMethod) => Promise<void>;
}

export function PayManySheet({ buyerName, numbers, numberPrice, onClose, onConfirm }: PayManySheetProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [saving, setSaving] = useState(false);
  const count = numbers.length;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(method);
    } catch {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      title={`Cobrar a ${buyerName}`}
      subtitle={`${count} ${count === 1 ? "número" : "números"} · ${formatCurrency(count * numberPrice)}`}
      onClose={onClose}
    >
      <div className="flex flex-wrap gap-2">
        {numbers.map((n) => (
          <span
            key={n.id}
            className="flex h-10 min-w-10 items-center justify-center rounded-xl border border-gold-600/60 bg-gold-400/10 px-2.5 font-[family-name:var(--font-heading)] text-base font-bold text-gold-300"
          >
            {formatNumberValue(n.value)}
          </span>
        ))}
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-text-muted">Método de pago</span>
        <div className="grid grid-cols-4 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              disabled={saving}
              className={`h-11 rounded-xl text-xs font-semibold transition active:scale-[0.97] ${
                method === m ? "bg-gold-400 text-[#241a02]" : "border border-line bg-surface-2 text-text-muted"
              }`}
            >
              {PAYMENT_METHOD_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={saving}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-green-400 to-green-600 text-base font-bold text-[#052012] shadow-green transition active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? <Spinner size={20} /> : `Marcar ${count === 1 ? "el número" : `los ${count}`} como pagado${count === 1 ? "" : "s"}`}
      </button>
    </BottomSheet>
  );
}
