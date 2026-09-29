"use client";

import { useState } from "react";
import type { PublicLinkAction } from "@/lib/types";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";

interface PublicLinkSheetProps {
  raffleName: string;
  /** Current secret of the public page, or null when the link is off. */
  token: string | null;
  /** Only the organizer can turn it on/off or replace it; sellers can copy and share it. */
  canManage: boolean;
  /** Whether visitors can reserve numbers from the public page right now. */
  reservationsOpen: boolean;
  onClose: () => void;
  onChange: (action: PublicLinkAction) => Promise<void>;
}

export function publicLinkUrl(token: string): string {
  return `${window.location.origin}/p/${token}`;
}

/** The raffle's public, read-only page: for buyers to check what's still available without an account. */
export function PublicLinkSheet({ raffleName, token, canManage, reservationsOpen, onClose, onChange }: PublicLinkSheetProps) {
  const [busy, setBusy] = useState<PublicLinkAction | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmingRenew, setConfirmingRenew] = useState(false);

  const url = token ? publicLinkUrl(token) : null;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const run = async (action: PublicLinkAction) => {
    setBusy(action);
    setNote(null);
    try {
      await onChange(action);
      setConfirmingRenew(false);
    } catch {
      setNote("No se pudo actualizar el enlace. Inténtalo de nuevo.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setNote("Enlace copiado");
    } catch {
      setNote("No se pudo copiar. Mantén presionado el enlace para copiarlo.");
    }
  };

  const share = async () => {
    if (!url) return;
    try {
      await navigator.share({ title: raffleName, text: `${raffleName}: mira qué números siguen disponibles`, url });
    } catch {
      // Closing the share sheet isn't an error.
    }
  };

  return (
    <BottomSheet title="Enlace para compradores" subtitle={raffleName} onClose={busy ? () => {} : onClose}>
      {url ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="publicLinkUrl" className="text-sm font-medium text-text-muted">
              Cualquiera con este enlace puede ver la rifa
            </label>
            <input
              id="publicLinkUrl"
              type="text"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-sm text-text outline-none focus:border-gold-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copy}
              className="flex h-12 items-center justify-center rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-bold text-[#241a02] shadow-gold transition active:scale-[0.98]"
            >
              Copiar enlace
            </button>
            {canNativeShare ? (
              <button
                type="button"
                onClick={share}
                className="flex h-12 items-center justify-center rounded-2xl border border-gold-600/50 text-sm font-semibold text-gold-400 transition active:scale-[0.98]"
              >
                Compartir
              </button>
            ) : (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center rounded-2xl border border-gold-600/50 text-sm font-semibold text-gold-400 transition active:scale-[0.98]"
              >
                Abrir
              </a>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-text-muted">
          {canManage
            ? "Crea un enlace para que tus compradores vean, sin iniciar sesión, qué números o letras siguen disponibles."
            : "El organizador todavía no activó un enlace para compradores."}
        </p>
      )}

      {url && (
        <p
          className={`rounded-2xl border px-4 py-3 text-xs ${
            reservationsOpen ? "border-green-500/40 bg-green-500/10 text-green-400" : "border-line bg-surface-2 text-text-muted"
          }`}
        >
          {reservationsOpen
            ? "Reservas activadas: quien abre el enlace puede apartar números y tiene el plazo de la rifa para pagar."
            : "Reservas desactivadas: el enlace solo muestra qué está disponible. Se activan en Editar rifa o en Mi equipo (y necesitan un plazo de pago)."}
        </p>
      )}

      <div className="space-y-1 rounded-2xl border border-line bg-surface-2 p-4 text-xs text-text-muted">
        <p className="font-semibold text-text">Qué ve quien lo abre</p>
        <p>
          El premio, los precios, la fecha del sorteo, las cuentas de pago y qué números o letras están disponibles o
          vendidos. Nunca ven nombres ni teléfonos de otros compradores, ni comprobantes.{" "}
          {reservationsOpen ? "Solo pueden apartar lo que siga libre." : "No pueden apartar ni cambiar nada."}
        </p>
      </div>

      {note && (
        <p role="status" className="text-sm font-medium text-gold-400">
          {note}
        </p>
      )}

      {canManage && !token && (
        <button
          type="button"
          onClick={() => run("enable")}
          disabled={busy !== null}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy === "enable" ? <Spinner size={20} /> : "Activar enlace"}
        </button>
      )}

      {canManage && token && (
        <div className="space-y-2.5">
          {!confirmingRenew ? (
            <button
              type="button"
              onClick={() => setConfirmingRenew(true)}
              disabled={busy !== null}
              className="flex h-12 w-full items-center justify-center rounded-2xl border border-line text-sm font-semibold text-text-muted transition active:scale-[0.98] disabled:opacity-50"
            >
              Generar un enlace nuevo
            </button>
          ) : (
            <div className="space-y-2 rounded-2xl border border-gold-600/50 bg-gold-400/10 p-3">
              <p className="text-sm text-text">
                El enlace de ahora dejará de funcionar y tendrás que compartir el nuevo. ¿Continuar?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingRenew(false)}
                  disabled={busy !== null}
                  className="h-11 flex-1 rounded-xl border border-line text-sm font-semibold text-text"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => run("regenerate")}
                  disabled={busy !== null}
                  className="flex h-11 flex-1 items-center justify-center rounded-xl bg-gold-400 text-sm font-semibold text-[#241a02]"
                >
                  {busy === "regenerate" ? <Spinner size={16} /> : "Sí, generar"}
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => run("disable")}
            disabled={busy !== null}
            className="flex h-12 w-full items-center justify-center rounded-2xl border border-red-500/40 text-sm font-semibold text-red-400 transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy === "disable" ? <Spinner size={16} /> : "Desactivar enlace"}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
