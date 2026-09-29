"use client";

import { useEffect, useState } from "react";
import { promptInstall, useInstallMode } from "@/lib/useInstallApp";
import { BottomSheet } from "@/components/BottomSheet";

/**
 * "Instalar app": one tap where the browser allows it, step-by-step help on
 * iPhone/iPad, and nothing at all when the app is already installed or the
 * browser can't install it.
 */
export function InstallAppButton() {
  const mode = useInstallMode();
  const [helpOpen, setHelpOpen] = useState(false);

  // Installing needs a registered service worker in some browsers; ours is
  // push-only and caches nothing, so registering it early is harmless.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  if (mode === "installed" || mode === "none") return null;

  const handleClick = () => {
    if (mode === "prompt") void promptInstall();
    else setHelpOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-gold-600/40 bg-bg-elevated/60 text-sm font-semibold text-gold-400 transition active:scale-[0.98]"
      >
        <PhoneIcon className="h-4 w-4" />
        Instalar app
      </button>

      {helpOpen && (
        <BottomSheet title="Instalar Ibirifas" subtitle="En tu iPhone o iPad" onClose={() => setHelpOpen(false)}>
          <ol className="space-y-3 text-sm text-text">
            <Step n={1}>
              Toca el botón <b>Compartir</b> <ShareIcon className="inline h-4 w-4 align-[-3px] text-gold-400" /> del
              navegador.
            </Step>
            <Step n={2}>
              Desliza y elige <b>Añadir a pantalla de inicio</b>.
            </Step>
            <Step n={3}>
              Toca <b>Añadir</b>. Ibirifas queda como una app en tu pantalla de inicio.
            </Step>
          </ol>
          <p className="text-xs text-text-muted">Si no ves esa opción, abre este enlace en Safari e inténtalo de nuevo.</p>
        </BottomSheet>
      )}
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-400 text-xs font-bold text-[#241a02]">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v6m0 0-2.5-2.5M12 14l2.5-2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 15V3m0 0L8 7m4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
