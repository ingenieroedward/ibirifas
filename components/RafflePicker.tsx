import Link from "next/link";
import type { RaffleSummaryDTO } from "@/lib/types";
import { formatCurrency, formatDrawDate } from "@/lib/format";

interface RafflePickerProps {
  raffles: RaffleSummaryDTO[];
}

/** Card list used to choose which raffle to open, shown to ORGANIZER/SELLER with 2+ raffles. */
export function RafflePicker({ raffles }: RafflePickerProps) {
  return (
    <div className="flex flex-col gap-3">
      {raffles.map((raffle) => (
        <RaffleCard key={raffle.id} raffle={raffle} />
      ))}
    </div>
  );
}

function RaffleCard({ raffle }: { raffle: RaffleSummaryDTO }) {
  const occupied = raffle.occupiedCount + raffle.paidCount;

  return (
    <Link
      href={`/rifas/${raffle.id}`}
      className="block overflow-hidden rounded-2xl border border-gold-600/30 bg-bg-elevated shadow-card transition active:scale-[0.98]"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <p className="truncate font-[family-name:var(--font-heading)] text-lg font-bold text-text">
            {raffle.name}
          </p>
          <p className="truncate text-sm text-text-muted">
            {raffle.prizeLabel || "Premio por definir"}
          </p>
        </div>
        {raffle.status === "closed" && (
          <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Cerrada
          </span>
        )}
      </div>

      <div className="mt-3 flex divide-x divide-line border-t border-line">
        <div className="flex-1 px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {raffle.groupCount > 0 ? "Conjuntos" : "Valor"}
          </p>
          <p className="mt-0.5 font-[family-name:var(--font-heading)] text-base font-extrabold text-gold-400">
            {raffle.groupCount > 0 ? `${raffle.groupCount} letras` : formatCurrency(raffle.numberPrice)}
          </p>
        </div>
        <div className="flex-1 px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Sorteo
          </p>
          <p className="mt-0.5 truncate text-base font-semibold text-text">
            {raffle.drawDate ? formatDrawDate(raffle.drawDate) : "Por definir"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-text">
          <span className="h-2.5 w-2.5 rounded-full bg-gold-400" />
          {raffle.availableCount} disponibles
        </span>
        <span className="flex items-center gap-1.5 font-medium text-text">
          <span className="h-2.5 w-2.5 rounded-full bg-surface-2 ring-1 ring-line" />
          {occupied} ocupados
        </span>
      </div>

      {raffle.paidCount > 0 && (
        <p className="px-4 pb-3 text-xs text-text-muted">
          <span className="font-semibold text-green-400">{formatCurrency(raffle.collected)}</span>{" "}
          recaudados
        </p>
      )}
    </Link>
  );
}
