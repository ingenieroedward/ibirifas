import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import type { RaffleDTO, Role } from "@/lib/types";
import { CrownIcon } from "@/components/icons/Crown";
import { Spinner } from "@/components/Spinner";

interface DashboardHeaderProps {
  raffle: RaffleDTO;
  userName: string;
  role: Role;
  /** True when the signed-in user has more than one raffle (so "back to picker" makes sense). */
  showBackToPicker: boolean;
  onLogout: () => void;
  onDownloadImage: () => void;
  downloadingImage: boolean;
}

export function DashboardHeader({
  raffle,
  userName,
  role,
  showBackToPicker,
  onLogout,
  onDownloadImage,
  downloadingImage,
}: DashboardHeaderProps) {
  const available = raffle.numbers.filter((n) => n.status === "available").length;
  const paid = raffle.numbers.filter((n) => n.status === "paid").length;
  const occupied = raffle.numbers.filter((n) => n.status === "occupied").length + paid;
  const collected = paid * raffle.numberPrice;

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

        {(showBackToPicker || role === "ORGANIZER") && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {showBackToPicker && (
              <Link
                href="/"
                className="flex items-center gap-1 rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-text-muted transition active:scale-95"
              >
                <BackIcon className="h-3.5 w-3.5" />
                Mis rifas
              </Link>
            )}
            {role === "ORGANIZER" && (
              <Link
                href="/usuarios"
                className="rounded-full border border-gold-600/40 px-3.5 py-1.5 text-xs font-semibold text-gold-400 transition active:scale-95"
              >
                Mi equipo
              </Link>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
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
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-gold-600/30 bg-bg-elevated shadow-card">
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
                Valor del número
              </p>
              <p className="mt-0.5 truncate font-[family-name:var(--font-heading)] text-xl font-extrabold text-gold-400">
                {formatCurrency(raffle.numberPrice)}
              </p>
            </div>
          </div>
          {(raffle.drawDate || raffle.lottery) && (
            <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-sm text-text-muted">
              <CalendarIcon className="h-4 w-4 shrink-0 text-gold-400" />
              <span>
                {raffle.drawDate ? `Sorteo el ${formatDate(raffle.drawDate)}` : "Sorteo"}
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

        <div className="mt-4 flex items-center gap-3 text-sm">
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

        <button
          type="button"
          onClick={onDownloadImage}
          disabled={downloadingImage}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-gold-600/40 bg-bg-elevated text-sm font-semibold text-gold-400 transition active:scale-[0.98] disabled:opacity-60 sm:w-auto sm:px-5"
        >
          {downloadingImage ? (
            <>
              <Spinner size={16} />
              Generando imagen…
            </>
          ) : (
            <>
              <DownloadIcon className="h-4 w-4" />
              Descargar imagen para compartir
            </>
          )}
        </button>
      </div>
    </header>
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
