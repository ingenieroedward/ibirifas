"use client";

import { useCallback, useEffect, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";
import { activateRaffle, ApiError, getActivation } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import type { ActivationStateDTO } from "@/lib/types";

interface ActivationSheetProps {
  raffleId: string;
  raffleName: string;
  totalNumbers: number;
  orgCode: string | null;
  isOrganizer: boolean;
  onClose: () => void;
  /** The raffle became active (free, credit, or the payment was confirmed). */
  onActivated: () => void;
}

const POLL_MS = 5_000;

/**
 * Activating a raffle so it can sell (lib/billing.ts): with the free first raffle, a credit, or paying. While a
 * payment is under way it keeps asking, so the sheet turns into "¡Activada!" by itself once the bank confirms.
 */
export function ActivationSheet({ raffleId, raffleName, totalNumbers, orgCode, isOrganizer, onClose, onActivated }: ActivationSheetProps) {
  const [state, setState] = useState<ActivationStateDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    (next: ActivationStateDTO) => {
      setState(next);
      if (next.active) onActivated();
    },
    [onActivated],
  );

  useEffect(() => {
    let cancelled = false;
    getActivation(raffleId)
      .then((s) => !cancelled && apply(s))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "No se pudo cargar. Revisa tu conexión."));
    return () => {
      cancelled = true;
    };
  }, [raffleId, apply]);

  // A payment under way: check now and then until it's confirmed.
  const waiting = Boolean(state && !state.active && state.checkoutUrl);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      getActivation(raffleId).then(apply).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, raffleId, apply]);

  const run = async (action: "allowance" | "pay") => {
    setBusy(true);
    setError(null);
    try {
      const next = await activateRaffle(raffleId, action);
      apply(next);
      if (action === "pay" && next.checkoutUrl && !next.active) window.location.assign(next.checkoutUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar. Revisa tu conexión.");
    } finally {
      setBusy(false);
    }
  };

  const size = totalNumbers <= 100 ? "hasta 100 números" : `${totalNumbers.toLocaleString("es-CO")} números`;
  const whatsappText = encodeURIComponent(
    `Hola, quiero activar mi rifa «${raffleName}» (${totalNumbers} números)${orgCode ? `, organización ${orgCode}` : ""}.`,
  );

  return (
    <BottomSheet title={state?.active ? "¡Rifa activada!" : "Activar la rifa"} subtitle={raffleName} onClose={busy ? () => {} : onClose}>
      {!state && !error && (
        <div className="flex justify-center py-8">
          <Spinner size={28} className="text-gold-400" />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {state?.active && (
        <div className="space-y-3 text-center">
          <p className="text-4xl" aria-hidden="true">
            🎉
          </p>
          <p className="text-sm text-text">Ya puedes vender números y compartir el enlace de la rifa.</p>
          <button type="button" onClick={onClose} className={PRIMARY}>
            Empezar a vender
          </button>
        </div>
      )}

      {state && !state.active && !isOrganizer && (
        <p className="text-sm text-text-muted">
          Esta rifa todavía no está activa. Pídele al organizador que la active para empezar a vender.
        </p>
      )}

      {state && !state.active && isOrganizer && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            La rifa ya está creada y la puedes preparar. Para vender números y compartir el enlace, actívala.
          </p>

          {state.option === "free" && (
            <>
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                <p className="font-semibold text-emerald-300">Tu primera rifa es gratis</p>
                <p className="mt-0.5 text-sm text-emerald-200/80">Con todo incluido, para que pruebes Ibirifas.</p>
              </div>
              <button type="button" onClick={() => void run("allowance")} disabled={busy} className={PRIMARY}>
                {busy ? <Spinner size={18} /> : "Activar gratis"}
              </button>
            </>
          )}

          {state.option === "credit" && (
            <>
              <div className="rounded-2xl border border-gold-600/40 bg-gold-400/10 p-4">
                <p className="font-semibold text-gold-400">
                  Tienes {state.credits} {state.credits === 1 ? "rifa" : "rifas"} de saldo
                </p>
                <p className="mt-0.5 text-sm text-text-muted">Activar esta rifa usa 1.</p>
              </div>
              <button type="button" onClick={() => void run("allowance")} disabled={busy} className={PRIMARY}>
                {busy ? <Spinner size={18} /> : "Activar con mi saldo"}
              </button>
            </>
          )}

          {state.option === "pay" && (
            <>
              <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Rifa de {size}</p>
                <p className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-extrabold text-gold-400">
                  {formatCurrency(state.price)}
                </p>
                <p className="mt-1 text-xs text-text-muted">Un solo pago por esta rifa, con todo incluido. No cobramos comisión de tus ventas.</p>
              </div>

              {state.payOnline ? (
                <>
                  {state.checkoutUrl && (
                    <p role="status" className="flex items-center gap-2 text-sm text-gold-400">
                      <Spinner size={14} /> Esperando la confirmación del pago… se activa sola.
                    </p>
                  )}
                  <button type="button" onClick={() => void run("pay")} disabled={busy} className={PRIMARY}>
                    {busy ? <Spinner size={18} /> : state.checkoutUrl ? "Continuar el pago" : "Pagar con Bre-B"}
                  </button>
                  <p className="text-center text-xs text-text-muted">
                    Pagas desde la app de tu banco con llave Bre-B y la rifa se activa sola en uno o dos minutos.
                  </p>
                </>
              ) : state.whatsapp ? (
                <>
                  <a
                    href={`https://wa.me/${state.whatsapp}?text=${whatsappText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={WHATSAPP}
                  >
                    Pedir la activación por WhatsApp
                  </a>
                  <p className="text-center text-xs text-text-muted">Te decimos cómo pagar y, al confirmarlo, activamos la rifa.</p>
                </>
              ) : (
                <p className="text-sm text-text-muted">Comunícate con quien te dio acceso a Ibirifas para activarla.</p>
              )}
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

const PRIMARY =
  "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

const WHATSAPP =
  "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#25d366] text-base font-bold text-[#062b14] transition active:scale-[0.98]";
