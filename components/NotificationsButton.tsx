"use client";

import { useState } from "react";
import { usePushNotifications } from "@/lib/usePushNotifications";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";

/** Bell in the header that opens the notification settings for this device. */
export function NotificationsButton() {
  const { status, busy, message, enable, disable, test } = usePushNotifications();
  const [open, setOpen] = useState(false);

  if (status === "loading" || status === "hidden") return null;

  const on = status === "on";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={on ? "Notificaciones activadas" : "Activar notificaciones"}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition active:scale-90 ${
          on ? "border-gold-600/60 text-gold-400" : "border-line text-text-muted"
        }`}
      >
        <BellIcon className="h-4 w-4" />
        {on && <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-gold-400 ring-2 ring-bg" />}
      </button>

      {open && (
        <BottomSheet title="Notificaciones" subtitle="Avisos en este dispositivo" onClose={() => setOpen(false)}>
          {status === "ios-install" && (
            <div className="space-y-3 text-sm text-text-muted">
              <p>
                En iPhone y iPad las notificaciones solo funcionan con la app instalada en la pantalla de inicio.
              </p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Abre Ibirifas en Safari y toca el botón Compartir.</li>
                <li>Elige &quot;Añadir a pantalla de inicio&quot;.</li>
                <li>Abre la app desde su ícono y vuelve aquí para activarlas.</li>
              </ol>
            </div>
          )}

          {status === "denied" && (
            <p className="text-sm text-text-muted">
              Bloqueaste las notificaciones de este sitio. Para recibirlas, permítelas desde los ajustes del
              navegador (o de la app, si la instalaste) y vuelve aquí.
            </p>
          )}

          {(status === "off" || status === "on") && (
            <p className="text-sm text-text-muted">
              {on
                ? "Te avisaremos en este dispositivo cuando alguien del equipo venda, cobre o libere un número."
                : "Recibe un aviso en tu teléfono cuando alguien del equipo venda, cobre o libere un número, aunque no tengas la app abierta."}
            </p>
          )}

          {message && <p className="text-sm font-medium text-gold-400">{message}</p>}

          {status === "off" && (
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? <Spinner size={20} /> : "Activar notificaciones"}
            </button>
          )}

          {status === "on" && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={test}
                disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-gold-600/50 text-sm font-semibold text-gold-400 transition active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? <Spinner size={18} /> : "Enviar una prueba"}
              </button>
              <button
                type="button"
                onClick={disable}
                disabled={busy}
                className="flex h-12 w-full items-center justify-center rounded-2xl border border-line text-sm font-semibold text-text-muted transition active:scale-[0.98] disabled:opacity-50"
              >
                Desactivar en este dispositivo
              </button>
            </div>
          )}
        </BottomSheet>
      )}
    </>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z M10 19a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
