import { formatCurrency, formatDate } from "@/lib/format";
import type { RaffleDTO } from "@/lib/types";
import { CrownIcon } from "@/components/icons/Crown";

interface DashboardHeaderProps {
  raffle: RaffleDTO;
  userName: string;
  onLogout: () => void;
}

export function DashboardHeader({ raffle, userName, onLogout }: DashboardHeaderProps) {
  const available = raffle.numbers.filter((n) => n.status === "available").length;
  const paid = raffle.numbers.filter((n) => n.status === "paid").length;
  const occupied = raffle.numbers.filter((n) => n.status === "occupied").length + paid;

  return (
    <header className="px-4 pt-safe">
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

      <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight text-text">
        {raffle.name}
      </h1>

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
        {raffle.drawDate && (
          <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-sm text-text-muted">
            <CalendarIcon className="h-4 w-4 shrink-0 text-gold-400" />
            <span>Sorteo el {formatDate(raffle.drawDate)}</span>
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
    </header>
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

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
