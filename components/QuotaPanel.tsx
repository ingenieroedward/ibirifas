"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/payment";
import {
  amountRemaining,
  discountNow,
  installmentPrices,
  lastPayDay,
  paidStages,
  standingOf,
  type StageSettings,
} from "@/lib/stages";
import type { PaymentMethod, QuotaAction, RaffleNumberDTO } from "@/lib/types";
import { Spinner } from "@/components/Spinner";

/**
 * The installments of a sold number in a raffle by stages: which are paid, which stage it plays, and the buttons
 * to collect the next one, catch up, collect everything (with the up-front discount) or undo the last one.
 */
export function QuotaPanel({
  number,
  settings,
  canCollect,
  onQuotas,
}: {
  number: RaffleNumberDTO;
  settings: StageSettings;
  /** False once the raffle is closed. */
  canCollect: boolean;
  onQuotas: (action: QuotaAction, method: PaymentMethod) => Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState<QuotaAction | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const prices = installmentPrices(settings.stages);
  const paid = paidStages(settings.stages);
  const quotas = number.quotas;
  const remaining = amountRemaining(quotas, settings.stages);
  const discount = discountNow(quotas, settings);
  const standing = standingOf(quotas, settings);
  const next = quotas.length < prices.length ? prices[quotas.length]! : 0;
  const bonus = settings.stages.find((s) => s.bonus);
  const firstDay = paid[0] ? lastPayDay(paid[0], settings.deadlineDays) : null;

  const run = async (action: QuotaAction) => {
    setBusy(action);
    try {
      await onQuotas(action, method);
      setConfirmUndo(false);
    } catch {
      // The page already showed the error.
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-2xl border border-line bg-surface-2 p-4">
        <p className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Cuotas</span>
          <span className="font-semibold text-text">
            {quotas.length} de {prices.length}
            {remaining > 0 ? ` · debe ${formatCurrency(remaining)}` : " · pagado completo"}
          </span>
        </p>
        <ol className="space-y-1.5" aria-label="Cuotas del número">
          {prices.map((price, i) => {
            const q = quotas[i];
            const stage = paid[i]!;
            const day = lastPayDay(stage, settings.deadlineDays);
            return (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-text">
                  <span className={q ? "text-green-400" : "text-text-muted"}>{q ? "✓" : "○"}</span> Cuota {i + 1}
                  <span className="text-text-muted"> · {stage.label}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-text-muted">
                  {q
                    ? `${formatCurrency(q.amount)} · ${PAYMENT_METHOD_LABEL[q.method]} · ${formatDate(q.paidAt)}`
                    : `${formatCurrency(price)}${day ? ` · hasta el ${day}` : ""}`}
                </span>
              </li>
            );
          })}
        </ol>
        {standing.stage && (
          <p
            role="status"
            className={`text-xs font-medium ${standing.upToDate ? "text-green-400" : standing.late ? "text-red-400" : "text-gold-400"}`}
          >
            {standing.upToDate
              ? `Al día: juega ${standing.stage.label}.`
              : standing.late
                ? `No pagó a tiempo: no juega ${standing.stage.label}.`
                : `Para jugar ${standing.stage.label} debe pagar ${formatCurrency(standing.due)}${standing.lastDay ? ` hasta el ${standing.lastDay}` : ""}.`}
          </p>
        )}
        {bonus && (
          <p className="text-xs text-text-muted">
            {bonus.label}: juegan los números pagados completos
            {firstDay ? ` hasta el ${firstDay}` : " antes de la primera etapa"}.
          </p>
        )}
      </div>

      {canCollect && remaining > 0 && (
        <>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-text-muted">Método de pago</span>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  disabled={busy !== null}
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
            onClick={() => run("next")}
            disabled={busy !== null}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-green-400 to-green-600 text-base font-bold text-[#052012] shadow-green transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy === "next" ? <Spinner size={20} /> : `Cobrar cuota ${quotas.length + 1} · ${formatCurrency(next)}`}
          </button>
          {standing.due > next && (
            <button
              type="button"
              onClick={() => run("due")}
              disabled={busy !== null}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-green-500/50 text-sm font-semibold text-green-400 transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy === "due" ? <Spinner size={18} /> : `Ponerse al día · ${formatCurrency(standing.due)}`}
            </button>
          )}
          {remaining > next && (
            <button
              type="button"
              onClick={() => run("all")}
              disabled={busy !== null}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-green-500/50 text-sm font-semibold text-green-400 transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy === "all" ? (
                <Spinner size={18} />
              ) : discount > 0 ? (
                <>
                  Cobrar todo · {formatCurrency(remaining - discount)}
                  <span className="text-xs font-normal line-through opacity-70">{formatCurrency(remaining)}</span>
                </>
              ) : (
                `Cobrar todo · ${formatCurrency(remaining)}`
              )}
            </button>
          )}
        </>
      )}

      {canCollect && quotas.length > 0 &&
        (confirmUndo ? (
          <div className="flex items-center gap-2 rounded-2xl border border-line p-2">
            <span className="flex-1 px-1 text-xs text-text-muted">¿Deshacer la cuota {quotas.length}?</span>
            <button
              type="button"
              onClick={() => setConfirmUndo(false)}
              disabled={busy !== null}
              className="h-9 rounded-xl border border-line px-3 text-xs font-semibold text-text"
            >
              No
            </button>
            <button
              type="button"
              onClick={() => run("undo")}
              disabled={busy !== null}
              className="flex h-9 items-center rounded-xl bg-surface-2 px-3 text-xs font-semibold text-text"
            >
              {busy === "undo" ? <Spinner size={14} /> : "Sí, deshacer"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmUndo(true)}
            disabled={busy !== null}
            className="h-10 w-full text-xs font-semibold text-text-muted underline-offset-2 hover:underline"
          >
            Deshacer la última cuota
          </button>
        ))}
    </div>
  );
}
