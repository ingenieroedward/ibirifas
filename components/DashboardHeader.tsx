"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { formatCurrency, formatNumberValue, formatDrawWhen } from "@/lib/format";
import { makePricer } from "@/lib/groups";
import { drawPlanFromNumbers } from "@/lib/drawPlan";
import { collectedOn, currentStage, installmentPrices, stagesPrizeSummary } from "@/lib/stages";
import type { RaffleDTO, Role } from "@/lib/types";
import { AccountsList } from "@/components/AccountsList";
import { describeHolder } from "@/components/CloseRaffleSheet";
import { CrownIcon } from "@/components/icons/Crown";
import { NotificationsButton } from "@/components/NotificationsButton";
import { PaymentsLink } from "@/components/PaymentsLink";
import { UserMenu } from "@/components/UserMenu";
import { Spinner } from "@/components/Spinner";
import { WinnerWhatsApp } from "@/components/WinnerWhatsApp";

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
  /** Copies the raffle and what is still available as a chat message. */
  onCopyText: () => void;
  /** Opens the sheet that sets the draw date (organizer only). */
  onSetDrawDate: () => void;
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
  onCopyText,
  onSetDrawDate,
  onOpenPublicLink,
  onCloseRaffle,
  onReopenRaffle,
  onDeleteRaffle,
}: DashboardHeaderProps) {
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const closed = raffle.status === "closed";
  const basePlan = drawPlanFromNumbers(raffle);
  // A raffle by stages: the line about when it's played is about the next stage.
  const nextStage = raffle.stages.length > 0 ? currentStage(raffle.stages) : null;
  const plan = nextStage
    ? {
        ...basePlan,
        line: `Próximo: ${nextStage.label} (${nextStage.prize})${nextStage.drawDate ? ` el ${formatDrawWhen(nextStage.drawDate, raffle.drawTime)}` : ""}`,
      }
    : basePlan;
  const lotteryText = nextStage?.lottery || raffle.lottery;
  const available = raffle.numbers.filter((n) => n.status === "available").length;
  const paid = raffle.numbers.filter((n) => n.status === "paid").length;
  const occupied = raffle.numbers.filter((n) => n.status === "occupied").length + paid;
  const pricer = makePricer(raffle);
  const byStages = raffle.stages.length > 0;
  // A raffle by stages collects installment by installment.
  const collected = byStages
    ? raffle.numbers.reduce((sum, n) => sum + collectedOn(n.quotas), 0)
    : pricer(raffle.numbers.filter((n) => n.status === "paid"));
  const installments = byStages ? installmentPrices(raffle.stages) : [];
  const installmentText =
    installments.length > 0
      ? new Set(installments).size === 1
        ? `${installments.length} cuotas de ${formatCurrency(installments[0]!)}`
        : `Cuotas: ${installments.map(formatCurrency).join(" + ")}`
      : null;
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
          <div className="flex items-center gap-2.5">
            <PaymentsLink />
            <NotificationsButton />
            <UserMenu userName={userName} onLogout={onLogout} />
          </div>
        </div>

        {closed && (
          <div className="mb-3 rounded-2xl border border-gold-600/50 bg-gold-400/10 p-4" role="status">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-400">Rifa cerrada</p>
            {byStages ? (
              <p className="mt-1 text-sm text-text-muted">Se jugaron todas las etapas: los resultados están abajo.</p>
            ) : raffle.winnerValue !== null ? (
              <>
                <p className="mt-1 font-[family-name:var(--font-heading)] text-lg font-extrabold text-text">
                  Ganó el{" "}
                  <span className="text-2xl text-gold-400">{formatNumberValue(raffle.winnerValue)}</span>
                </p>
                <p className="text-sm text-text-muted">{describeHolder(raffle, raffle.winnerValue)}</p>
                <WinnerWhatsApp
                  raffle={raffle}
                  winnerValue={raffle.winnerValue}
                  prize={raffle.prizeLabel}
                  stageLabel={null}
                  drawDate={raffle.drawDate}
                  lottery={raffle.lottery}
                />
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
            // One row on any phone: the labels get shorter (the full name stays in aria-label)
            // instead of a chip wrapping onto a second line by itself.
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* An organizer always needs the way home: it is where "Crear rifa" lives. */}
              <Link
                href="/"
                className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold text-text-muted transition active:scale-95 min-[360px]:px-3 sm:px-3.5"
              >
                <BackIcon className="hidden h-3.5 w-3.5 min-[360px]:block" />
                Mis rifas
              </Link>
              {role === "ORGANIZER" && (
                <>
                  <Link
                    href="/rifas/nueva"
                    aria-label="Crear rifa"
                    className="shrink-0 whitespace-nowrap rounded-full border border-gold-600/40 px-2.5 py-1.5 text-xs font-semibold text-gold-400 transition active:scale-95 min-[360px]:px-3 sm:px-3.5"
                  >
                    <span aria-hidden="true" className="sm:hidden">Nueva</span>
                    <span aria-hidden="true" className="hidden sm:inline">Crear rifa</span>
                  </Link>
                  <Link
                    href="/usuarios"
                    aria-label="Mi equipo"
                    className="shrink-0 whitespace-nowrap rounded-full border border-gold-600/40 px-2.5 py-1.5 text-xs font-semibold text-gold-400 transition active:scale-95 min-[360px]:px-3 sm:px-3.5"
                  >
                    <span aria-hidden="true" className="sm:hidden">Equipo</span>
                    <span aria-hidden="true" className="hidden sm:inline">Mi equipo</span>
                  </Link>
                  {!closed && (
                    <button
                      type="button"
                      onClick={onCloseRaffle}
                      aria-label="Cerrar rifa"
                      className="shrink-0 whitespace-nowrap rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold text-text-muted transition active:scale-95 min-[360px]:px-3 sm:px-3.5"
                    >
                      <span aria-hidden="true" className="sm:hidden">Cerrar</span>
                      <span aria-hidden="true" className="hidden sm:inline">Cerrar rifa</span>
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
                  {raffle.prizeLabel || stagesPrizeSummary(raffle.stages) || "Por definir"}
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
                {installmentText && <p className="truncate text-xs text-text-muted">{installmentText}</p>}
              </div>
            </div>
            {(plan.line || lotteryText) && (
              <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-sm text-text-muted">
                <CalendarIcon className="h-4 w-4 shrink-0 text-gold-400" />
                <span>
                  {plan.line ?? "Sorteo"}
                  {lotteryText && (
                    <>
                      {plan.line && " · "}
                      {lotteryText}
                    </>
                  )}
                </span>
              </div>
            )}
            {plan.progress && (
              <div className="border-t border-line px-4 py-2.5" aria-label="Avance para jugar">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>
                    {plan.progress.done} de {plan.progress.total} {plan.progress.noun}
                  </span>
                  <span>{Math.round((plan.progress.done / Math.max(1, plan.progress.total)) * 100)}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={plan.progress.total} aria-valuenow={plan.progress.done}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-500"
                    style={{ width: `${Math.min(100, (plan.progress.done / Math.max(1, plan.progress.total)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {plan.needsDate && !closed && (
              <div className="flex items-center justify-between gap-3 border-t border-green-500/30 bg-green-500/10 px-4 py-2.5">
                <p className="min-w-0 text-sm font-semibold text-green-400">
                  ¡Rifa completa! {role === "ORGANIZER" ? "Fija la fecha del sorteo." : "Falta que el organizador fije la fecha."}
                </p>
                {role === "ORGANIZER" && (
                  <button
                    type="button"
                    onClick={onSetDrawDate}
                    className="h-9 shrink-0 rounded-full border border-green-500/50 px-3 text-xs font-bold text-green-400 transition active:scale-95"
                  >
                    Fijar fecha
                  </button>
                )}
              </div>
            )}
            {raffle.accounts.length > 0 && (
              <div className="space-y-1 border-t border-line px-4 py-2.5 text-sm text-text-muted">
                <AccountsList accounts={raffle.accounts} holderWord="Responsable" />
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
              className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-gold-600/40 bg-bg-elevated px-2 text-sm font-semibold text-gold-400 transition active:scale-[0.98] disabled:opacity-60 sm:flex-none sm:px-5"
            >
              {downloadingImage ? (
                <>
                  <Spinner size={16} />
                  <span aria-hidden="true" className="sm:hidden">Generando…</span>
                  <span aria-hidden="true" className="hidden sm:inline">Generando imagen…</span>
                </>
              ) : (
                <>
                  <DownloadIcon className="hidden h-4 w-4 shrink-0 min-[360px]:block" />
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
                className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-gold-600/40 bg-bg-elevated px-2 text-sm font-semibold text-gold-400 transition active:scale-[0.98] sm:flex-none sm:px-5"
              >
                <LinkIcon className="hidden h-4 w-4 shrink-0 min-[360px]:block" />
                <span aria-hidden="true" className="truncate sm:hidden">Enlace</span>
                <span aria-hidden="true" className="hidden sm:inline">
                  {raffle.publicToken ? "Enlace para compradores" : "Crear enlace para compradores"}
                </span>
              </button>
            )}
            {!closed && (
              <button
                type="button"
                onClick={onCopyText}
                aria-label="Copiar disponibles como texto"
                className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-gold-600/40 bg-bg-elevated px-2 text-sm font-semibold text-gold-400 transition active:scale-[0.98] sm:flex-none sm:gap-2 sm:px-5"
              >
                <TextIcon className="hidden h-4 w-4 shrink-0 min-[360px]:block" />
                <span aria-hidden="true" className="truncate sm:hidden">Texto</span>
                <span aria-hidden="true" className="hidden sm:inline">Copiar como texto</span>
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

function TextIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M8 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 9h7M9 12.5h7M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
