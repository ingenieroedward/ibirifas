"use client";

import { useEffect, useRef, useState } from "react";

/** Copies text to the clipboard, with the old textarea trick for browsers that block the modern API. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand("copy");
    box.remove();
    return ok;
  }
}

/** A small "Copiar" pill that turns into "¡Copiado!" for a moment. `label` says what is copied, for screen readers. */
export function CopyButton({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    setState((await copyText(text)) ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copiar ${label}`}
      className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full border px-3 text-xs font-semibold transition active:scale-95 ${
        state === "copied"
          ? "border-green-500/50 bg-green-500/10 text-green-400"
          : state === "failed"
            ? "border-red-500/50 text-red-400"
            : "border-gold-600/50 text-gold-400"
      } ${className}`}
    >
      <span aria-live="polite">{state === "copied" ? "¡Copiado!" : state === "failed" ? "No se pudo" : "Copiar"}</span>
    </button>
  );
}
