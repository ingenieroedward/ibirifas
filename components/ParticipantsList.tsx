"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { daysLeft, daysText, daysWaiting, isOverdue } from "@/lib/holds";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment";
import type { RaffleDTO, RaffleGroupDTO, RaffleNumberDTO } from "@/lib/types";
import { buildReceiptMessage, buildReminderMessage, whatsAppUrl } from "@/lib/whatsapp";

interface ParticipantsListProps {
  numbers: RaffleNumberDTO[];
  /** Lettered sets, when the raffle has them. */
  groups: RaffleGroupDTO[];
  /** Worth of some numbers, counting sets at their set price. */
  priceOf: (subset: RaffleNumberDTO[]) => number;
  /** What the WhatsApp reminders and receipts say about the raffle. */
  raffle: WhatsAppRaffle;
  /** The winning number of a closed raffle; whoever holds it is flagged. */
  winnerValue?: number | null;
  /** Days a sold number may wait for its payment before it is overdue; null = no deadline. */
  holdDays?: number | null;
  /** Overdue numbers go back on sale by themselves. */
  autoRelease?: boolean;
  onSelect: (number: RaffleNumberDTO) => void;
  /** Collect every unpaid number of one buyer in a single step. */
  onPayAll: (buyerName: string, pending: RaffleNumberDTO[]) => void;
}

type WhatsAppRaffle = Pick<RaffleDTO, "name" | "accounts" | "drawDate" | "lottery">;

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.46 15.04L2 22l5.1-1.34A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 1 1-4.2 15.03l-.3-.18-3.02.8.81-2.94-.2-.31A8.1 8.1 0 0 1 12.04 3.8Zm-3 3.6c-.2 0-.5.07-.75.35-.26.28-1 1-1 2.45 0 1.44 1.04 2.84 1.19 3.04.15.2 2.05 3.28 5.06 4.47 2.5.99 3.01.79 3.55.74.55-.05 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.79-1.67-2.09-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57Z" />
    </svg>
  );
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

export function ParticipantsList({
  numbers,
  groups,
  priceOf,
  raffle,
  winnerValue,
  holdDays = null,
  autoRelease = false,
  onSelect,
  onPayAll,
}: ParticipantsListProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  // "Now" is read once per render pass of the data, not per card, so every card agrees.
  const [now] = useState(() => Date.now());
  const participants = useMemo(() => {
    const list = groupByBuyer(numbers);
    if (!holdDays) return list;
    // Whoever's payment is overdue goes to the top, longest wait first.
    const overdueDays = (p: Participant) => Math.max(0, ...p.numbers.filter((n) => isOverdue(n, holdDays, now)).map((n) => daysWaiting(n, now)));
    return list.sort((a, b) => overdueDays(b) - overdueDays(a));
  }, [numbers, holdDays, now]);

  const totals = useMemo(() => {
    let pending = 0;
    let paid = 0;
    let pendingAmount = 0;
    let paidAmount = 0;
    for (const p of participants) {
      pending += p.pendingCount;
      paid += p.paidCount;
      pendingAmount += priceOf(p.numbers.filter((n) => n.status !== "paid"));
      paidAmount += priceOf(p.numbers.filter((n) => n.status === "paid"));
    }
    return { pending, paid, pendingAmount, paidAmount };
  }, [participants, priceOf]);

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
      {holdDays !== null && (
        <p className="text-xs text-text-muted">
          Los apartados vencen a los {daysText(holdDays)} sin pago
          {autoRelease ? " y se liberan solos." : ": te avisamos una vez al día y tú decides."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gold-600/40 bg-bg-elevated p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Por cobrar
          </p>
          <p className="mt-0.5 font-[family-name:var(--font-heading)] text-2xl font-extrabold text-gold-400">
            {formatCurrency(totals.pendingAmount)}
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
            {formatCurrency(totals.paidAmount)}
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
              groups={groups}
              priceOf={priceOf}
              raffle={raffle}
              holdDays={holdDays}
              now={now}
              isWinner={winnerValue !== null && winnerValue !== undefined && p.numbers.some((n) => n.value === winnerValue)}
              onSelect={onSelect}
              onPayAll={onPayAll}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** What a buyer holds, as things you can tap: each whole set once, and every loose number. */
type Holding =
  | { kind: "set"; group: RaffleGroupDTO; members: RaffleNumberDTO[]; paid: boolean }
  | { kind: "number"; number: RaffleNumberDTO; paid: boolean };

function holdingsOf(numbers: RaffleNumberDTO[], groups: RaffleGroupDTO[]): Holding[] {
  const out: Holding[] = [];
  for (const g of groups) {
    const members = numbers.filter((n) => n.groupId === g.id);
    if (members.length > 0) out.push({ kind: "set", group: g, members, paid: members.every((n) => n.status === "paid") });
  }
  for (const n of numbers) if (n.groupId === null) out.push({ kind: "number", number: n, paid: n.status === "paid" });
  return out;
}

function ParticipantCard({
  participant: p,
  groups,
  priceOf,
  raffle,
  holdDays,
  now,
  isWinner,
  onSelect,
  onPayAll,
}: {
  participant: Participant;
  groups: RaffleGroupDTO[];
  priceOf: (subset: RaffleNumberDTO[]) => number;
  raffle: WhatsAppRaffle;
  holdDays: number | null;
  now: number;
  isWinner: boolean;
  onSelect: (number: RaffleNumberDTO) => void;
  onPayAll: (buyerName: string, pending: RaffleNumberDTO[]) => void;
}) {
  const owes = priceOf(p.numbers.filter((n) => n.status !== "paid"));
  const holdings = holdingsOf(p.numbers, groups);
  const pendingItems = holdings.filter((h) => !h.paid).length;

  // The deadline for unpaid sales: how long the worst one has waited, or how long is left before the first expires.
  const unpaid = p.numbers.filter((n) => n.status === "occupied");
  const overdue = holdDays ? unpaid.filter((n) => isOverdue(n, holdDays, now)) : [];
  const isLate = overdue.length > 0;
  const lateDays = Math.max(0, ...overdue.map((n) => daysWaiting(n, now)));
  const soonest = holdDays && !isLate ? Math.min(...unpaid.map((n) => daysLeft(n, holdDays, now) ?? Infinity)) : Infinity;
  const paidItems = holdings.length - pendingItems;

  // WhatsApp messages: one about what's still owed, one confirming what's paid.
  const partOf = (wantPaid: boolean) => {
    const chosen = holdings.filter((h) => h.paid === wantPaid);
    return {
      sets: chosen.flatMap((h) => (h.kind === "set" ? [h.group.label] : [])),
      looseValues: chosen.flatMap((h) => (h.kind === "number" ? [h.number.value] : [])),
      amount: priceOf(p.numbers.filter((n) => (n.status === "paid") === wantPaid)),
      count: chosen.length,
    };
  };
  const pendingPart = partOf(false);
  const paidPart = partOf(true);
  const methods = new Set(p.numbers.filter((n) => n.status === "paid").map((n) => n.paymentMethod));
  const onlyMethod = methods.size === 1 ? [...methods][0] : null;
  const reminderUrl =
    pendingPart.count > 0
      ? whatsAppUrl(
          p.phone,
          buildReminderMessage({
            buyerName: p.name,
            raffleName: raffle.name,
            sets: pendingPart.sets,
            looseValues: pendingPart.looseValues,
            amount: pendingPart.amount,
            accounts: raffle.accounts,
            drawDate: raffle.drawDate,
            lottery: raffle.lottery,
          }),
        )
      : null;
  const receiptUrl =
    paidPart.count > 0
      ? whatsAppUrl(
          p.phone,
          buildReceiptMessage({
            buyerName: p.name,
            raffleName: raffle.name,
            sets: paidPart.sets,
            looseValues: paidPart.looseValues,
            amount: paidPart.amount,
            paymentMethodLabel: onlyMethod ? PAYMENT_METHOD_LABEL[onlyMethod] : null,
          }),
        )
      : null;

  return (
    <li
      className={`rounded-2xl border bg-bg-elevated p-4 shadow-card ${isWinner ? "border-gold-300 ring-2 ring-gold-300" : "border-line"}`}
    >
      {isWinner && (
        <p className="mb-2 inline-block rounded-full bg-gold-300 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-[#241a02]">
          Ganador
        </p>
      )}
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

      {p.numbers.some((n) => n.online) && (
        <p className="mt-2 mr-1.5 inline-block rounded-full border border-gold-600/40 bg-gold-400/10 px-2.5 py-0.5 text-[11px] font-bold text-gold-300">
          Reserva en línea
        </p>
      )}
      {holdDays !== null && unpaid.length > 0 && (
        <p
          className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
            isLate ? "border border-red-500/40 bg-red-500/10 text-red-400" : "text-text-muted"
          }`}
        >
          {isLate
            ? `Vencido · ${daysText(lateDays)} sin pagar`
            : soonest === 0
              ? "Vence hoy"
              : `Vence en ${daysText(soonest)}`}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {holdings.map((h) => {
          const paid = h.paid;
          const label =
            h.kind === "set"
              ? `Conjunto ${h.group.label}, ${h.members.length} números, ${paid ? "pagado" : "pendiente de pago"}`
              : `Número ${formatNumberValue(h.number.value)}, ${paid ? "pagado" : "pendiente de pago"}`;
          return (
            <button
              key={h.kind === "set" ? h.group.id : h.number.id}
              type="button"
              onClick={() => onSelect(h.kind === "set" ? h.members[0]! : h.number)}
              aria-label={label}
              className={`flex h-11 min-w-11 items-center justify-center rounded-xl px-2.5 font-[family-name:var(--font-heading)] text-base font-bold transition active:scale-90 ${
                paid
                  ? "bg-gradient-to-b from-green-400 to-green-600 text-[#052012]"
                  : "border border-gold-600/60 bg-gold-400/10 text-gold-300"
              }`}
            >
              {h.kind === "set" ? `Conjunto ${h.group.label}` : formatNumberValue(h.number.value)}
            </button>
          );
        })}
      </div>

      {(p.pendingCount > 0 || receiptUrl) && (
        <div className="mt-3 space-y-2">
          {p.pendingCount > 0 && (
            // Collect and remind side by side. On a phone the labels shrink (the amount is
            // already in the "Debe" badge above); from `sm` up they read in full.
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  onPayAll(
                    p.name,
                    p.numbers.filter((n) => n.status !== "paid"),
                  )
                }
                aria-label={`${pendingItems === 1 ? "Marcar como pagado" : `Cobrar los ${pendingItems} pendientes`} · ${formatCurrency(owes)}`}
                className="flex h-11 min-w-0 flex-[1.3] items-center justify-center rounded-xl border border-green-500/40 bg-green-500/10 px-3 text-sm font-semibold text-green-400 transition active:scale-[0.98]"
              >
                <span aria-hidden="true" className="truncate sm:hidden">
                  {pendingItems === 1 ? "Cobrar" : "Cobrar todo"}
                </span>
                <span aria-hidden="true" className="hidden truncate sm:inline">
                  {pendingItems === 1 ? "Marcar como pagado" : `Cobrar los ${pendingItems} pendientes`} · {formatCurrency(owes)}
                </span>
              </button>
              {reminderUrl && (
                <a
                  href={reminderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Recordar pago por WhatsApp"
                  className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 text-sm font-semibold text-text transition active:scale-[0.98] sm:flex-none sm:px-5"
                >
                  <WhatsAppIcon className="h-4 w-4 shrink-0 text-green-400" />
                  <span aria-hidden="true" className="truncate sm:hidden">Recordar</span>
                  <span aria-hidden="true" className="hidden sm:inline">Recordar pago</span>
                </a>
              )}
            </div>
          )}
          {receiptUrl && (
            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 text-sm font-semibold text-text transition active:scale-[0.98]"
            >
              <WhatsAppIcon className="h-4 w-4 text-green-400" />
              Enviar comprobante
            </a>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-text-muted">
        {p.numbers.length} {p.numbers.length === 1 ? "número" : "números"}
        {paidItems > 0 && ` · ${paidItems} pagado${paidItems === 1 ? "" : "s"}`}
        {pendingItems > 0 && ` · ${pendingItems} pendiente${pendingItems === 1 ? "" : "s"}`}
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
