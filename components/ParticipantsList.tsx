"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import type { RaffleNumberDTO } from "@/lib/types";

interface ParticipantsListProps {
  numbers: RaffleNumberDTO[];
  numberPrice: number;
  onSelect: (number: RaffleNumberDTO) => void;
  /** Collect every unpaid number of one buyer in a single step. */
  onPayAll: (buyerName: string, pending: RaffleNumberDTO[]) => void;
}

type Filter = "all" | "pending" | "paid";

interface Participant {
  key: string;
  name: string;
  phone: string | null;
  numbers: RaffleNumberDTO[];
  pendingCount: number;
  paidCount: number;
}

/** Lowercase, accent-free, single-spaced — so "María  Pérez" and "maria perez" are one buyer. */
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function groupByBuyer(numbers: RaffleNumberDTO[]): Participant[] {
  const groups = new Map<string, Participant>();

  for (const number of numbers) {
    if (number.status === "available") continue;

    const name = number.buyerName?.trim() || "Sin nombre";
    const key = normalizeName(name);
    let group = groups.get(key);
    if (!group) {
      group = { key, name, phone: null, numbers: [], pendingCount: 0, paidCount: 0 };
      groups.set(key, group);
    }

    group.numbers.push(number);
    if (!group.phone && number.buyerPhone) group.phone = number.buyerPhone;
    if (number.status === "paid") group.paidCount += 1;
    else group.pendingCount += 1;
  }

  const list = [...groups.values()];
  for (const group of list) group.numbers.sort((a, b) => a.value - b.value);
  // Whoever still owes money first, then alphabetical.
  list.sort((a, b) => {
    if (a.pendingCount > 0 !== b.pendingCount > 0) return a.pendingCount > 0 ? -1 : 1;
    return a.name.localeCompare(b.name, "es");
  });
  return list;
}

export function ParticipantsList({ numbers, numberPrice, onSelect, onPayAll }: ParticipantsListProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const participants = useMemo(() => groupByBuyer(numbers), [numbers]);

  const totals = useMemo(() => {
    let pending = 0;
    let paid = 0;
    for (const p of participants) {
      pending += p.pendingCount;
      paid += p.paidCount;
    }
    return { pending, paid };
  }, [participants]);

  const debtors = participants.filter((p) => p.pendingCount > 0).length;

  const visible = useMemo(() => {
    const q = normalizeName(query);
    const qDigits = query.replace(/\D/g, "");
    return participants.filter((p) => {
      if (filter === "pending" && p.pendingCount === 0) return false;
      if (filter === "paid" && p.paidCount === 0) return false;
      if (!q) return true;
      if (p.key.includes(q)) return true;
      if (qDigits && p.phone?.replace(/\D/g, "").includes(qDigits)) return true;
      return qDigits.length > 0 && p.numbers.some((n) => n.value === Number(qDigits));
    });
  }, [participants, filter, query]);

  if (participants.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
        <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
          Aún no hay números vendidos
        </p>
        <p className="mt-1 text-sm text-text-muted">
          Cuando registres una venta en el tablero, el comprador aparecerá aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gold-600/40 bg-bg-elevated p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Por cobrar
          </p>
          <p className="mt-0.5 font-[family-name:var(--font-heading)] text-2xl font-extrabold text-gold-400">
            {formatCurrency(totals.pending * numberPrice)}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {totals.pending} {totals.pending === 1 ? "número" : "números"} · {debtors}{" "}
            {debtors === 1 ? "persona" : "personas"}
          </p>
        </div>
        <div className="rounded-2xl border border-green-500/30 bg-bg-elevated p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Recaudado
          </p>
          <p className="mt-0.5 font-[family-name:var(--font-heading)] text-2xl font-extrabold text-green-400">
            {formatCurrency(totals.paid * numberPrice)}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {totals.paid} {totals.paid === 1 ? "número pagado" : "números pagados"}
          </p>
        </div>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Filtrar por estado de pago">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Todos · {participants.length}
        </FilterChip>
        <FilterChip active={filter === "pending"} onClick={() => setFilter("pending")}>
          Deben · {debtors}
        </FilterChip>
        <FilterChip active={filter === "paid"} onClick={() => setFilter("paid")}>
          Con pagos · {participants.filter((p) => p.paidCount > 0).length}
        </FilterChip>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre, teléfono o número"
        aria-label="Buscar comprador"
        className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none placeholder:text-text-muted focus:border-gold-400"
      />

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-muted">No hay resultados para esa búsqueda.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((p) => (
            <ParticipantCard
              key={p.key}
              participant={p}
              numberPrice={numberPrice}
              onSelect={onSelect}
              onPayAll={onPayAll}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ParticipantCard({
  participant: p,
  numberPrice,
  onSelect,
  onPayAll,
}: {
  participant: Participant;
  numberPrice: number;
  onSelect: (number: RaffleNumberDTO) => void;
  onPayAll: (buyerName: string, pending: RaffleNumberDTO[]) => void;
}) {
  const owes = p.pendingCount * numberPrice;

  return (
    <li className="rounded-2xl border border-line bg-bg-elevated p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-[family-name:var(--font-heading)] text-lg font-bold leading-tight text-text">
            {p.name}
          </p>
          {p.phone && (
            <a href={`tel:${p.phone}`} className="text-sm text-gold-400 underline-offset-2 hover:underline">
              {p.phone}
            </a>
          )}
        </div>
        {p.pendingCount > 0 ? (
          <span className="shrink-0 rounded-full border border-gold-600/50 bg-gold-400/10 px-3 py-1 text-xs font-bold text-gold-400">
            Debe {formatCurrency(owes)}
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-bold text-green-400">
            Al día
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {p.numbers.map((n) => {
          const paid = n.status === "paid";
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelect(n)}
              aria-label={`Número ${formatNumberValue(n.value)}, ${paid ? "pagado" : "pendiente de pago"}`}
              className={`flex h-11 min-w-11 items-center justify-center rounded-xl px-2.5 font-[family-name:var(--font-heading)] text-base font-bold transition active:scale-90 ${
                paid
                  ? "bg-gradient-to-b from-green-400 to-green-600 text-[#052012]"
                  : "border border-gold-600/60 bg-gold-400/10 text-gold-300"
              }`}
            >
              {formatNumberValue(n.value)}
            </button>
          );
        })}
      </div>

      {p.pendingCount > 0 && (
        <button
          type="button"
          onClick={() =>
            onPayAll(
              p.name,
              p.numbers.filter((n) => n.status !== "paid"),
            )
          }
          className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border border-green-500/40 bg-green-500/10 text-sm font-semibold text-green-400 transition active:scale-[0.98]"
        >
          {p.pendingCount === 1 ? "Marcar como pagado" : `Cobrar los ${p.pendingCount} pendientes`} ·{" "}
          {formatCurrency(owes)}
        </button>
      )}

      <p className="mt-3 text-xs text-text-muted">
        {p.numbers.length} {p.numbers.length === 1 ? "número" : "números"}
        {p.paidCount > 0 && ` · ${p.paidCount} pagado${p.paidCount === 1 ? "" : "s"}`}
        {p.pendingCount > 0 && ` · ${p.pendingCount} pendiente${p.pendingCount === 1 ? "" : "s"}`}
      </p>
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-10 flex-1 rounded-full text-xs font-semibold transition active:scale-95 ${
        active ? "bg-gold-400 text-[#241a02]" : "border border-line bg-surface-2 text-text-muted"
      }`}
    >
      {children}
    </button>
  );
}
