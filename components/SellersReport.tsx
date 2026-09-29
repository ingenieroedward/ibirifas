"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { commissionOn, salesBySeller, sumSales, type SellerSales } from "@/lib/sales";
import type { RaffleNumberDTO } from "@/lib/types";
import { whatsAppUrl } from "@/lib/whatsapp";

interface SellersReportProps {
  raffleId: string;
  raffleName: string;
  numbers: RaffleNumberDTO[];
  /** Worth of some numbers, counting sets at their set price. */
  priceOf: (subset: RaffleNumberDTO[]) => number;
  /** A seller only sees their own line; the organizer sees the whole team. */
  viewerId: string;
  canSeeAll: boolean;
}

const storageKey = (raffleId: string) => `ibirifas_commission_${raffleId}`;

function readPercent(raffleId: string): string {
  try {
    return window.localStorage.getItem(storageKey(raffleId)) ?? "";
  } catch {
    return "";
  }
}

function parsePercent(text: string): number {
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function itemsText(row: { numbers: number; sets: number }): string {
  const nums = `${row.numbers} ${row.numbers === 1 ? "número" : "números"}`;
  return row.sets > 0 ? `${row.sets} ${row.sets === 1 ? "conjunto" : "conjuntos"} · ${nums}` : nums;
}

/** Sales per seller of one raffle: what each sold, what of it is paid, what is owed, and an optional commission. */
export function SellersReport({ raffleId, raffleName, numbers, priceOf, viewerId, canSeeAll }: SellersReportProps) {
  const [percentText, setPercentText] = useState(() => readPercent(raffleId));
  const percent = parsePercent(percentText);

  const rows = useMemo(() => {
    const all = salesBySeller(numbers, priceOf);
    return canSeeAll ? all : all.filter((r) => r.id === viewerId);
  }, [numbers, priceOf, canSeeAll, viewerId]);
  const total = useMemo(() => sumSales(rows), [rows]);

  const changePercent = (text: string) => {
    const clean = text.replace(/[^\d.,]/g, "").slice(0, 5);
    setPercentText(clean);
    try {
      window.localStorage.setItem(storageKey(raffleId), clean);
    } catch {
      // Not remembering the percentage is fine.
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
        <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">Aún no hay ventas</p>
        <p className="mt-1 text-sm text-text-muted">
          {canSeeAll ? "Cuando tu equipo venda números, verás aquí cuánto vendió cada uno." : "Cuando vendas números, verás aquí cuánto llevas."}
        </p>
      </div>
    );
  }

  const reportText = [
    `Ventas de ${raffleName}`,
    ...rows.map((r) => {
      const commission = percent > 0 ? ` · comisión ${percent}%: ${formatCurrency(commissionOn(r.collected, percent))}` : "";
      return `• ${r.name}: vendió ${formatCurrency(r.sold)}, cobrado ${formatCurrency(r.collected)}, por cobrar ${formatCurrency(r.pending)}${commission}`;
    }),
    ...(rows.length > 1 ? [`Total: vendido ${formatCurrency(total.sold)} · cobrado ${formatCurrency(total.collected)} · por cobrar ${formatCurrency(total.pending)}`] : []),
  ]
    .join("\n")
    .replace(/\u00a0/g, " ");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Vendido" value={total.sold} tone="text-text" />
        <Stat label="Cobrado" value={total.collected} tone="text-green-400" />
        <Stat label="Por cobrar" value={total.pending} tone="text-gold-400" />
      </div>

      <div className="rounded-2xl border border-line bg-bg-elevated p-4">
        <label htmlFor="commission" className="block text-sm font-semibold text-text">
          Comisión (opcional)
        </label>
        <p className="mt-0.5 text-xs text-text-muted">
          Se calcula sobre lo ya cobrado de las ventas de cada vendedor, sin importar quién recibió el dinero.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="commission"
            type="text"
            inputMode="decimal"
            value={percentText}
            onChange={(e) => changePercent(e.target.value)}
            placeholder="0"
            className="h-12 w-24 rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none placeholder:text-text-muted focus:border-gold-400"
          />
          <span className="text-base font-semibold text-text-muted">%</span>
        </div>
      </div>

      <ul className="space-y-3">
        {rows.map((r) => (
          <SellerCard key={r.id ?? "none"} row={r} percent={percent} />
        ))}
      </ul>

      <a
        href={whatsAppUrl(null, reportText)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-12 w-full items-center justify-center rounded-xl border border-line bg-surface-2 text-sm font-semibold text-text transition active:scale-[0.98]"
      >
        Enviar resumen por WhatsApp
      </a>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-bg-elevated p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-0.5 break-words font-[family-name:var(--font-heading)] text-base font-extrabold leading-tight sm:text-xl ${tone}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function SellerCard({ row, percent }: { row: SellerSales; percent: number }) {
  return (
    <li className="rounded-2xl border border-line bg-bg-elevated p-4 shadow-card" aria-label={`Ventas de ${row.name}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words font-[family-name:var(--font-heading)] text-lg font-bold leading-tight text-text">
          {row.name}
        </p>
        <p className="shrink-0 text-xs text-text-muted">{itemsText(row)}</p>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Figure label="Vendió" value={row.sold} tone="text-text" />
        <Figure label="Cobrado" value={row.collected} tone="text-green-400" />
        <Figure label="Por cobrar" value={row.pending} tone="text-gold-400" />
      </dl>
      {percent > 0 && (
        <p className="mt-3 rounded-xl border border-gold-600/40 bg-gold-400/10 px-3 py-2 text-sm font-semibold text-gold-400">
          Comisión {percent}%: {formatCurrency(commissionOn(row.collected, percent))}
        </p>
      )}
    </li>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-1 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className={`break-words font-[family-name:var(--font-heading)] text-sm font-bold ${tone}`}>{formatCurrency(value)}</dd>
    </div>
  );
}
