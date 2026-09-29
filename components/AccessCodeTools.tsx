"use client";

import { useEffect, useRef, useState } from "react";

interface AccessCodeToolsProps {
  /** What is currently typed in the boxes; "Copiar" is enabled once it's complete. */
  code: string;
  disabled?: boolean;
  onGenerate: () => void;
}

const BUTTON =
  "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

/** "Generar aleatorio" + "Copiar código" under the 6 boxes. */
export function AccessCodeTools({ code, disabled = false, onGenerate }: AccessCodeToolsProps) {
  // Remembers which code was copied, so a different code (a new generate or an edit) drops the note.
  const [copyResult, setCopyResult] = useState<{ code: string; state: "ok" | "error" } | null>(null);
  const copied = copyResult?.code === code ? copyResult.state : null;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    let state: "ok" | "error" = "ok";
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      state = "error";
    }
    setCopyResult({ code, state });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyResult(null), 2500);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={disabled}
          className={`${BUTTON} border-gold-600/50 text-gold-400`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
            <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
            <circle cx="8.5" cy="15.5" r="1" fill="currentColor" />
            <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
          </svg>
          Generar aleatorio
        </button>
        <button
          type="button"
          onClick={copy}
          disabled={disabled || code.length !== 6}
          className={`${BUTTON} border-line text-text-muted`}
        >
          {copied === "ok" ? "¡Copiado!" : "Copiar código"}
        </button>
      </div>
      {copied === "error" && <p className="text-xs font-medium text-red-400">No se pudo copiar. Anótalo a mano.</p>}
      <p className="text-xs text-text-muted">
        Anótalo o cópialo antes de guardar: por seguridad el código no se puede volver a ver después.
      </p>
    </div>
  );
}
