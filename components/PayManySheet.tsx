"use client";

import { useState } from "react";
import type { PaymentMethod, QuotaAction, RaffleGroupDTO, RaffleNumberDTO } from "@/lib/types";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/payment";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";

interface PayManySheetProps {
  buyerName: string;
  /** The buyer's numbers that are still unpaid. */
  numbers: RaffleNumberDTO[];
  groups: RaffleGroupDTO[];
  /** What these numbers add up to (sets count at their set price). */
  total: number;
  onClose: () => void;
  /** `action` is only given for a raffle by stages: which installments to collect. */
  onConfirm: (method: PaymentMethod, action?: Exclude<QuotaAction, "undo">) => Promise<void>;
  /** A raffle by stages: what collecting what's due now (or the next installment) and everything would cost. */
  stageAmounts?: { due: number; next: number; all: number } | null;
}

export function PayManySheet({ buyerName, numbers, groups, total, onClose, onConfirm, stageAmounts = null }: PayManySheetProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [stageAction, setStageAction] = useState<"due" | "next" | "all">(
    stageAmounts && stageAmounts.due > 0 ? "due" : "next",
  );
  const [saving, setSaving] = useState(false);
  const sets = groups.filter((g) => numbers.some((n) => n.groupId === g.id));
  const loose = numbers.filter((n) => n.groupId === null);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(method, stageAmounts ? stageAction : undefined);
    } catch {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      title={`Cobrar a ${buyerName}`}
      subtitle={`${[
        sets.length > 0 ? `${sets.length === 1 ? "Conjunto" : "Conjuntos"} ${sets.map((g) => g.label).join(", ")}` : null,
        loose.length > 0 ? `${loose.length} ${loose.length === 1 ? "número" : "números"}` : null,
      ]
        .filter(Boolean)
        .join(" + ")} · ${formatCurrency(stageAmounts ? stageAmounts.all : total)}${stageAmounts ? " por pagar" : ""}`}
      onClose={onClose}
    >
      <div className="flex flex-wrap gap-2">
        {sets.map((g) => (
          <span
            key={g.id}
            className="flex h-10 items-center justify-center rounded-xl border border-gold-600/60 bg-gold-400/10 px-3 font-[family-name:var(--font-heading)] text-base font-bold text-gold-400"
          >
            Conjunto {g.label}
          </span>
        ))}
        {loose.map((n) => (
          <span
            key={n.id}
            className="flex h-10 min-w-10 items-center justify-center rounded-xl border border-gold-600/60 bg-gold-400/10 px-2.5 font-[family-name:var(--font-heading)] text-base font-bold text-gold-400"
          >
            {formatNumberValue(n.value)}
          </span>
        ))}
      </div>

      {stageAmounts && (
        <div className="space-y-1.5" role="radiogroup" aria-label="Qué cobrar">
          <span className="text-sm font-medium text-text-muted">Qué cobrar</span>
          {(
            [
              stageAmounts.due > 0
                ? (["due", "Lo que debe para el próximo sorteo", stageAmounts.due] as const)
                : (["next", "La siguiente cuota", stageAmounts.next] as const),
              ["all", "Todo lo que falta", stageAmounts.all] as const,
            ] as const
          ).map(([value, label, amount]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={stageAction === value}
              onClick={() => setStageAction(value)}
              disabled={saving}
              className={`flex h-12 w-full items-center justify-between rounded-xl px-4 text-sm font-semibold transition active:scale-[0.99] ${
                stageAction === value ? "bg-gold-300 text-[#241a02]" : "border border-line bg-surface-2 text-text"
              }`}
            >
              <span>{label}</span>
              <span>{formatCurrency(amount)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-text-muted">Método de pago</span>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              disabled={saving}
              className={`h-11 rounded-xl text-xs font-semibold transition active:scale-[0.97] ${
                method === m ? "bg-gold-300 text-[#241a02]" : "border border-line bg-surface-2 text-text-muted"
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
        {saving ? <Spinner size={20} /> : stageAmounts ? (
          `Cobrar ${formatCurrency(stageAction === "all" ? stageAmounts.all : stageAction === "due" ? stageAmounts.due : stageAmounts.next)}`
        ) : (() => {
            const items = sets.length + loose.length;
            if (sets.length > 0 && items === 1) return `Marcar el conjunto ${sets[0]!.label} como pagado`;
            return `Marcar ${items === 1 ? "el número" : `los ${items}`} como pagado${items === 1 ? "" : "s"}`;
          })()}
      </button>
    </BottomSheet>
  );
}
