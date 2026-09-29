"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { formatCurrency, formatDrawDate, formatNumberValue } from "@/lib/format";
import { makePricer } from "@/lib/groups";
import type { RaffleDTO, Role } from "@/lib/types";
import { describeHolder } from "@/components/CloseRaffleSheet";
import { CrownIcon } from "@/components/icons/Crown";
import { NotificationsButton } from "@/components/NotificationsButton";
import { Spinner } from "@/components/Spinner";

// Whether the folding part of the header is hidden. Remembered on the device (localStorage),
// with an in-memory fallback for browsers that refuse storage.
const COLLAPSED_KEY = "ibirifas_header_collapsed";
const COLLAPSED_EVENT = "ibirifas:header-collapsed";
let collapsedInMemory = false;

function subscribeCollapsed(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSED_EVENT, onChange);
  };
}

function readCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored !== null) return stored === "1";
  } catch {
    // Storage blocked: fall back to memory.
  }
  return collapsedInMemory;
}

function setHeaderCollapsed(next: boolean): void {
  collapsedInMemory = next;
  try {
    localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  } catch {
    // Kept in memory for this visit.
  }
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
}

interface DashboardHeaderProps {
  raffle: RaffleDTO;
  userName: string;
  role: Role;
  /** True when the signed-in user has more than one raffle (so "back to picker" makes sense). */
  showBackToPicker: boolean;
  onLogout: () => void;
  onDownloadImage: () => void;
  downloadingImage: boolean;
  /** This browser can open the system share sheet with the image (phones), so the button says "Compartir". */
  canShareImage: boolean;
  /** Opens the sheet with the raffle's public link for buyers. */
  onOpenPublicLink: () => void;
  /** Organizer actions on the raffle's life cycle. */
  onCloseRaffle: () => void;
  onReopenRaffle: () => void;
  onDeleteRaffle: () => void;
}

export function DashboardHeader({
  raffle,
  userName,
  role,
  showBackToPicker,
  onLogout,
  onDownloadImage,
  downloadingImage,
  canShareImage,
  onOpenPublicLink,
  onCloseRaffle,
  onReopenRaffle,
  onDeleteRaffle,
}: DashboardHeaderProps) {
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const closed = raffle.status === "closed";
  const available = raffle.numbers.filter((n) => n.status === "available").length;
  const paid = raffle.numbers.filter((n) => n.status === "paid").length;
  const occupied = raffle.numbers.filter((n) => n.status === "occupied").length + paid;
  const pricer = makePricer(raffle);
  const collected = pricer(raffle.numbers.filter((n) => n.status === "paid"));
  const hasGroups = raffle.groups.length > 0;
  const looseCount = raffle.numbers.filter((n) => n.groupId === null).length;
  const setPrices = raffle.groups.map((g) => g.price);
  const setPriceText = hasGroups
    ? Math.min(...setPrices) === Math.max(...setPrices)
      ? formatCurrency(setPrices[0]!)
      : `${formatCurrency(Math.min(...setPrices))} – ${formatCurrency(Math.max(...setPrices))}`
    : null;

  return (
    <header className="px-4 pt-safe sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <CrownIcon className="h-5 w-8 text-gold-400" />
            <span className="font-[family-name:var(--font-heading)] text-lg font-bold text-gold-400">
              Ibirifas
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="max-w-[9rem] truncate text-sm font-medium text-text-muted">
              {userName}
            </span>
            <NotificationsButton />
            <button
              type="button"
              onClick={onLogout}
              aria-label="Cerrar sesión"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-text-muted transition active:scale-90"
            >
              <LogoutIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {closed && (
          <div className="mb-3 rounded-2xl border border-gold-600/50 bg-gold-400/10 p-4" role="status">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-400">Rifa cerrada</p>
            {raffle.winnerValue !== null ? (
              <>
                <p className="mt-1 font-[family-name:var(--font-heading)] text-lg font-extrabold text-text">
                  Ganó el{" "}
                  <span className="text-2xl text-gold-400">{formatNumberValue(raffle.winnerValue)}</span>
                </p>
                <p className="text-sm text-text-muted">{describeHolder(raffle, raffle.winnerValue)}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-text-muted">Se cerró sin registrar un número ganador.</p>
            )}
            <p className="mt-1 text-xs text-text-muted">Ya no se venden ni se liberan números; los pagos sí se pueden registrar.</p>
            {role === "ORGANIZER" && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onReopenRaffle}
                  className="h-10 flex-1 rounded-xl border border-gold-600/50 text-sm font-semibold text-gold-400 transition active:scale-[0.98]"
                >
                  Reabrir rifa
                </button>
                <button
                  type="button"
                  onClick={onDeleteRaffle}
                  className="h-10 flex-1 rounded-xl border border-red-500/40 text-sm font-semibold text-red-400 transition active:scale-[0.98]"
                >
                  Eliminar rifa
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* The way home stays in reach even with the details folded. */}
          {(showBackToPicker || role === "ORGANIZER") && (
            <Link
              href="/"
              aria-label="Mis rifas"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-text-muted transition active:scale-90"
            >
              <BackIcon className="h-4 w-4" />
            </Link>
          )}
          <h1 className="min-w-0 flex-1 font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight text-text">
            {raffle.name}
          </h1>
          {role === "ORGANIZER" && (
            <Link
              href={`/rifas/${raffle.id}/editar`}
              aria-label="Editar rifa"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-text-muted transition active:scale-90"
            >
              <EditIcon className="h-3.5 w-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setHeaderCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-controls="raffle-details"
            className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-line px-3 text-xs font-semibold text-text-muted transition active:scale-95"
          >
            {collapsed ? "Detalles" : "Ocultar"}
            <ChevronIcon className={`h-3.5 w-3.5 transition-transform ${collapsed ? "" : "rotate-180"}`} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-text">
            <span className="h-2.5 w-2.5 rounded-full bg-gold-400" />
            {available} disponibles
          </span>
          <span className="flex items-center gap-1.5 font-medium text-text">
            <span className="h-2.5 w-2.5 rounded-full bg-surface-2 ring-1 ring-line" />
            {occupied} ocupados
          </span>
          {paid > 0 && (
            <span className="flex items-center gap-1.5 font-medium text-text">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              {paid} pagados
            </span>
          )}
        </div>

        {paid > 0 && (
          <p className="mt-2 text-sm text-text-muted">
            <span className="font-semibold text-green-400">{formatCurrency(collected)}</span>{" "}
            recaudados hasta ahora
          </p>
        )}

        {/* Everything below the counts folds away, so a phone can show the board itself.
            The choice is remembered on this device. */}
        {!collapsed && (
          <div id="raffle-details" className="mt-4 space-y-4">
          {(showBackToPicker || role === "ORGANIZER") && (
            <div className="flex flex-wrap items-center gap-2">
              {/* An organizer always needs the way home: it is where "Crear rifa" lives. */}
              <Link
                href="/"
                className="flex items-center gap-1 rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-text-muted transition active:scale-95"
              >
                <BackIcon className="h-3.5 w-3.5" />
                Mis rifas
              </Link>
              {role === "ORGANIZER" && (
                <>
                  <Link
                    href="/rifas/nueva"
                    className="rounded-full border border-gold-600/40 px-3.5 py-1.5 text-xs font-semibold text-gold-400 transition active:scale-95"
                  >
                    Crear rifa
                  </Link>
                  <Link
                    href="/usuarios"
                    className="rounded-full border border-gold-600/40 px-3.5 py-1.5 text-xs font-semibold text-gold-400 transition active:scale-95"
                  >
                    Mi equipo
                  </Link>
                  {!closed && (
                    <button
                      type="button"
                      onClick={onCloseRaffle}
                      className="rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-text-muted transition active:scale-95"
                    >
                      Cerrar rifa
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-gold-600/30 bg-bg-elevated shadow-card">
            <div className="flex divide-x divide-line">
              <div className="flex-1 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Premio
                </p>
                <p className="mt-0.5 truncate font-[family-name:var(--font-heading)] text-xl font-extrabold text-gold-400">
                  {raffle.prizeLabel || "Por definir"}
                </p>
              </div>
              <div className="flex-1 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {hasGroups ? "Valor del conjunto" : "Valor del número"}
                </p>
                <p className="mt-0.5 truncate font-[family-name:var(--font-heading)] text-xl font-extrabold text-gold-400">
                  {hasGroups ? setPriceText : formatCurrency(raffle.numberPrice)}
                </p>
                {hasGroups && looseCount > 0 && (
                  <p className="truncate text-xs text-text-muted">Suelto: {formatCurrency(raffle.numberPrice)}</p>
                )}
              </div>
            </div>
            {(raffle.drawDate || raffle.lottery) && (
              <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-sm text-text-muted">
                <CalendarIcon className="h-4 w-4 shrink-0 text-gold-400" />
                <span>
                  {raffle.drawDate ? `Sorteo el ${formatDrawDate(raffle.drawDate)}` : "Sorteo"}
                  {raffle.lottery && (
                    <>
                      {raffle.drawDate && " · "}
                      {raffle.lottery}
                    </>
                  )}
                </span>
              </div>
            )}
            {raffle.accounts.length > 0 && (
              <div className="space-y-1 border-t border-line px-4 py-2.5 text-sm text-text-muted">
                {raffle.accounts.map((account) => (
                  <div key={account.id} className="flex items-start gap-2">
                    <WalletIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                    <span>
                      <span className="font-medium text-text">{account.label}</span> {account.number}
                      {account.holderName && (
                        <span className="text-text-muted"> · Responsable: {account.holderName}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* One row on every screen. On a phone the labels shrink to one word (the icons carry the rest);
              from `sm` up they read in full. The aria-label always holds the full text. */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDownloadImage}
              disabled={downloadingImage}
              aria-label={
                downloadingImage
                  ? "Generando imagen"
                  : canShareImage
                    ? "Compartir imagen"
                    : "Descargar imagen para compartir"
              }
              className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-gold-600/40 bg-bg-elevated px-3 text-sm font-semibold text-gold-400 transition active:scale-[0.98] disabled:opacity-60 sm:flex-none sm:px-5"
            >
              {downloadingImage ? (
                <>
                  <Spinner size={16} />
                  <span aria-hidden="true" className="sm:hidden">Generando…</span>
                  <span aria-hidden="true" className="hidden sm:inline">Generando imagen…</span>
                </>
              ) : (
                <>
                  <DownloadIcon className="h-4 w-4 shrink-0" />
                  <span aria-hidden="true" className="truncate sm:hidden">Imagen</span>
                  <span aria-hidden="true" className="hidden sm:inline">
                    {canShareImage ? "Compartir imagen" : "Descargar imagen para compartir"}
                  </span>
                </>
              )}
            </button>
            {(role === "ORGANIZER" || raffle.publicToken) && (
              <button
                type="button"
                onClick={onOpenPublicLink}
                aria-label={raffle.publicToken ? "Enlace para compradores" : "Crear enlace para compradores"}
                className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-gold-600/40 bg-bg-elevated px-3 text-sm font-semibold text-gold-400 transition active:scale-[0.98] sm:flex-none sm:px-5"
              >
                <LinkIcon className="h-4 w-4 shrink-0" />
                <span aria-hidden="true" className="truncate sm:hidden">Enlace</span>
                <span aria-hidden="true" className="hidden sm:inline">
                  {raffle.publicToken ? "Enlace para compradores" : "Crear enlace para compradores"}
                </span>
              </button>
            )}
          </div>

          </div>
        )}

      </div>
    </header>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M15 17l5-5-5-5M20 12H9M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 7v0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 13.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M13 11h6a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-6a2.5 2.5 0 0 1 0-5Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
