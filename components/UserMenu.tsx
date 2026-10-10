"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

const ROLE_LABEL = { SUPERADMIN: "Administrador", ORGANIZER: "Organizador", SELLER: "Vendedor" } as const;

/** "Organizador Demo" -> "OD". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]![0], words[words.length - 1]![0]] : [...(words[0] ?? "?").slice(0, 2)];
  return letters.join("").toUpperCase();
}

/**
 * The signed-in person in the header: a round button with their initials (and their name next to it on wide
 * screens) that opens a small menu with who they are, "Mi cuenta", "Mi equipo" and "Cerrar sesión". Keeps the
 * header to a few round buttons on a phone instead of a cut-off name squeezed between them.
 */
export function UserMenu({ userName, onLogout }: { userName: string; onLogout: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const role = user?.role;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menú de ${userName}`}
        className="flex items-center gap-2 rounded-full transition active:scale-95"
      >
        <span className="hidden max-w-[10rem] truncate text-sm font-medium text-text-muted sm:block">{userName}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold-600/50 bg-gold-400/10 text-xs font-bold text-gold-400">
          {initials(userName)}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-2xl border border-line bg-bg-elevated shadow-card"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="break-words text-sm font-semibold text-text">{userName}</p>
            {role && <p className="text-xs text-text-muted">{ROLE_LABEL[role]}</p>}
          </div>
          <Link role="menuitem" href="/cuenta" onClick={() => setOpen(false)} className="block px-4 py-3 text-sm text-text hover:bg-surface-2">
            Mi cuenta
          </Link>
          {role === "ORGANIZER" && (
            <Link role="menuitem" href="/usuarios" onClick={() => setOpen(false)} className="block px-4 py-3 text-sm text-text hover:bg-surface-2">
              Mi equipo
            </Link>
          )}
          {role === "ORGANIZER" && (
            <Link role="menuitem" href="/pagos" onClick={() => setOpen(false)} className="block px-4 py-3 text-sm text-text hover:bg-surface-2">
              Pagos
            </Link>
          )}
          {role === "ORGANIZER" && (
            <Link role="menuitem" href="/rifas/papelera" onClick={() => setOpen(false)} className="block px-4 py-3 text-sm text-text hover:bg-surface-2">
              Papelera
            </Link>
          )}
          {role === "SUPERADMIN" && (
            <Link role="menuitem" href="/cobros" onClick={() => setOpen(false)} className="block px-4 py-3 text-sm text-text hover:bg-surface-2">
              Cobros
            </Link>
          )}
          {(role === "ORGANIZER" || role === "SUPERADMIN") && (
            <Link role="menuitem" href="/actividad" onClick={() => setOpen(false)} className="block px-4 py-3 text-sm text-text hover:bg-surface-2">
              Actividad
            </Link>
          )}
          <Link role="menuitem" href="/ayuda" onClick={() => setOpen(false)} className="block px-4 py-3 text-sm text-text hover:bg-surface-2">
            Ayuda
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="block w-full border-t border-line px-4 py-3 text-left text-sm font-semibold text-red-400 hover:bg-surface-2"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
