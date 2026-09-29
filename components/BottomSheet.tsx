"use client";

import type { ReactNode } from "react";

interface BottomSheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/** Same bottom-sheet look as NumberSheet, for flows that aren't about a single number. */
export function BottomSheet({ title, subtitle, onClose, children }: BottomSheetProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 max-h-[92dvh] w-full animate-sheet-up overflow-y-auto scrollbar-thin rounded-t-3xl border-t border-line bg-surface pb-safe shadow-card sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl sm:border"
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-line" />
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">{title}</p>
            {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-text-muted transition active:scale-90"
          >
            ✕
          </button>
        </div>
        <div className="space-y-5 px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
