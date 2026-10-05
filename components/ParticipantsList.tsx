"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatCurrency, formatDrawDate, formatNumberValue } from "@/lib/format";
import { triggerCondition } from "@/lib/drawPlan";
import { DAY_MS, daysLeft, daysText, daysWaiting, drawCutoff, isOverdue } from "@/lib/holds";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment";
import { PhoneEditor } from "@/components/PhoneEditor";
import type { RaffleDTO, RaffleGroupDTO, RaffleNumberDTO } from "@/lib/types";
import { buildReceiptMessage, buildReminderMessage, whatsAppUrl } from "@/lib/whatsapp";
import {
  amountRemaining,
  collectedOn,
  currentPaidStage,
  installmentPrices,
  quotaBadge,
  standingOf,
  type StageSettings,
} from "@/lib/stages";

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
  /** The draw date when unpaid holds must be paid the day before it (raffles without stages). */
  drawDate?: string | null;
  /** The draw's time ("21:00"): holds made on the draw day are due then. */
  drawTime?: string | null;
  /** Overdue numbers go back on sale by themselves. */
  autoRelease?: boolean;
  onSelect: (number: RaffleNumberDTO) => void;
  /** Collect every unpaid number of one buyer in a single step. */
  onPayAll: (buyerName: string, pending: RaffleNumberDTO[]) => void;
  /** Saves the phone on all of a buyer's numbers (for buyers registered without one). */
  onEditPhone?: (numbers: RaffleNumberDTO[], phone: string | null) => Promise<void>;
  /** A raffle by stages: amounts come from the installments, and each number shows how many are paid. */
  stageSettings?: StageSettings | null;
}

type WhatsAppRaffle = Pick<RaffleDTO, "name" | "accounts" | "drawDate" | "lottery" | "drawTrigger">;

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
  drawDate = null,
  drawTime = null,
  autoRelease = false,
  onSelect,
  onPayAll,
  onEditPhone,
  stageSettings = null,
}: ParticipantsListProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // A payment receipt opened full screen from a buyer's card.
  const [receiptOpen, setReceiptOpen] = useState<string | null>(null);

  // "Now" is read once per render pass of the data, not per card, so every card agrees.
  const [now] = useState(() => Date.now());
  const participants = useMemo(() => {
    const list = groupByBuyer(numbers);
    if (!holdDays) return list;
    // Whoever's payment is overdue goes to the top, longest wait first.
    const overdueDays = (p: Participant) => Math.max(0, ...p.numbers.filter((n) => isOverdue(n, holdDays, now, drawDate, drawTime)).map((n) => daysWaiting(n, now)));
    return list.sort((a, b) => overdueDays(b) - overdueDays(a));
  }, [numbers, holdDays, now, drawDate, drawTime]);

  const totals = useMemo(() => {
    let pending = 0;
    let paid = 0;
    let pendingAmount = 0;
    let paidAmount = 0;
    for (const p of participants) {
      pending += p.pendingCount;
      paid += p.paidCount;
      if (stageSettings) {
        pendingAmount += p.numbers.reduce((sum, n) => sum + amountRemaining(n.quotas, stageSettings.stages), 0);
        paidAmount += p.numbers.reduce((sum, n) => sum + collectedOn(n.quotas), 0);
      } else {
        pendingAmount += priceOf(p.numbers.filter((n) => n.status !== "paid"));
        paidAmount += priceOf(p.numbers.filter((n) => n.status === "paid"));
      }
    }
    return { pending, paid, pendingAmount, paidAmount };
  }, [participants, priceOf, stageSettings]);

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
          {drawDate && (drawCutoff(drawDate) ?? 0) > now ? `, o el ${formatDrawDate(new Date(new Date(drawDate).getTime() - DAY_MS).toISOString())} (día antes del sorteo) si llega primero` : ""}
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
              drawDate={drawDate}
              drawTime={drawTime}
              now={now}
              isWinner={winnerValue !== null && winnerValue !== undefined && p.numbers.some((n) => n.value === winnerValue)}
              onSelect={onSelect}
              onPayAll={onPayAll}
              onEditPhone={onEditPhone}
              onViewReceipt={setReceiptOpen}
              stageSettings={stageSettings}
            />
          ))}
        </ul>
      )}

      {receiptOpen && (
        <div
          role="dialog"
          aria-label="Comprobante"
          className="fixed inset-0 z-[110] flex animate-fade-in items-center justify-center bg-black/95 p-4"
          onClick={() => setReceiptOpen(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={receiptOpen} alt="Comprobante ampliado" className="max-h-full max-w-full rounded-lg object-contain" />
          <button
            type="button"
            onClick={() => setReceiptOpen(null)}
            aria-label="Cerrar comprobante"
            className="absolute right-5 top-[calc(env(safe-area-inset-top,0px)+1rem)] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
          >
            ✕
          </button>
        </div>
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
  drawDate,
  drawTime,
  now,
  isWinner,
  onSelect,
  onPayAll,
  onEditPhone,
  onViewReceipt,
  stageSettings,
}: {
  participant: Participant;
  groups: RaffleGroupDTO[];
  priceOf: (subset: RaffleNumberDTO[]) => number;
  raffle: WhatsAppRaffle;
  holdDays: number | null;
  drawDate: string | null;
  drawTime: string | null;
  now: number;
  isWinner: boolean;
  onSelect: (number: RaffleNumberDTO) => void;
  onPayAll: (buyerName: string, pending: RaffleNumberDTO[]) => void;
  onEditPhone?: (numbers: RaffleNumberDTO[], phone: string | null) => Promise<void>;
  onViewReceipt: (photoDataUrl: string) => void;
  stageSettings: StageSettings | null;
}) {
  // Every distinct receipt this buyer sent (a set carries one copy on each of its numbers), viewable from here
  // without opening each number or set.
  const receipts = [...new Set(p.numbers.map((n) => n.photoDataUrl).filter((u): u is string => Boolean(u)))];
  // A raffle by stages: what is owed overall, what must be paid now to play the next draw, and what was paid.
  const stageMoney = stageSettings
    ? (() => {
        const owed = p.numbers.filter((n) => n.status !== "paid");
        const prices = installmentPrices(stageSettings.stages);
        const due = owed.reduce((sum, n) => sum + standingOf(n.quotas, stageSettings).due, 0);
        const next = owed.reduce((sum, n) => sum + (prices[n.quotas.length] ?? 0), 0);
        return {
          remaining: owed.reduce((sum, n) => sum + amountRemaining(n.quotas, stageSettings.stages), 0),
          due,
          next,
          collected: p.numbers.reduce((sum, n) => sum + collectedOn(n.quotas), 0),
        };
      })()
    : null;
  const owes = stageMoney ? stageMoney.remaining : priceOf(p.numbers.filter((n) => n.status !== "paid"));
  const holdings = holdingsOf(p.numbers, groups);
  const pendingItems = holdings.filter((h) => !h.paid).length;

  // The deadline for unpaid sales: how long the worst one has waited, or how long is left before the first expires.
  const unpaid = p.numbers.filter((n) => n.status === "occupied");
  const overdue = holdDays ? unpaid.filter((n) => isOverdue(n, holdDays, now, drawDate, drawTime)) : [];
  const isLate = overdue.length > 0;
  const lateDays = Math.max(0, ...overdue.map((n) => daysWaiting(n, now)));
  const soonest = holdDays && !isLate ? Math.min(...unpaid.map((n) => daysLeft(n, holdDays, now, drawDate, drawTime) ?? Infinity)) : Infinity;
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
  if (stageMoney) {
    // Installments: the reminder asks for what's due now (or the next installment); the receipt counts every
    // number with something paid and the total paid so far.
    pendingPart.amount = stageMoney.due > 0 ? stageMoney.due : stageMoney.next;
    const withPayments = p.numbers.filter((n) => n.quotas.length > 0);
    paidPart.looseValues = withPayments.map((n) => n.value);
    paidPart.count = withPayments.length;
    paidPart.amount = stageMoney.collected;
  }
  const collectingStage = stageSettings ? currentPaidStage(stageSettings.stages) : null;
  const collectingDay = stageSettings && p.numbers[0] ? standingOf(p.numbers[0].quotas, stageSettings).lastDay : null;
  const stageNote =
    stageSettings && collectingStage
      ? `Para jugar *${collectingStage.label}* (premio ${collectingStage.prize}) debes estar al día${collectingDay ? ` antes de terminar el ${collectingDay}` : ""}.`
      : null;
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
            drawCondition: raffle.drawDate || raffle.drawTrigger === "date" ? null : triggerCondition(raffle.drawTrigger),
            lottery: raffle.lottery,
            stageNote,
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
            progress: stageSettings ? stageProgress(p.numbers, stageSettings) : null,
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
          {!onEditPhone && p.phone && (
            <a href={`tel:${p.phone}`} className="text-sm text-gold-400 underline-offset-2 hover:underline">
              {p.phone}
            </a>
          )}
        </div>
        {stageMoney && p.pendingCount > 0 ? (
          stageMoney.due > 0 ? (
            <span className="shrink-0 rounded-full border border-gold-600/50 bg-gold-400/10 px-3 py-1 text-right text-xs font-bold text-gold-400">
              Debe ahora {formatCurrency(stageMoney.due)}
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-right text-xs font-bold text-green-400">
              Al día · faltan {formatCurrency(stageMoney.remaining)}
            </span>
          )
        ) : p.pendingCount > 0 ? (
          <span className="shrink-0 rounded-full border border-gold-600/50 bg-gold-400/10 px-3 py-1 text-xs font-bold text-gold-400">
            Debe {formatCurrency(owes)}
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-bold text-green-400">
            Al día
          </span>
        )}
      </div>

      {onEditPhone && p.numbers.every((n) => n.buyerName) && (
        <div className="-mt-0.5">
          <PhoneEditor phone={p.phone} onSave={(phone) => onEditPhone(p.numbers, phone)} />
        </div>
      )}

      {p.numbers.some((n) => n.online) && (
        <p className="mt-2 mr-1.5 inline-block rounded-full border border-gold-600/40 bg-gold-400/10 px-2.5 py-0.5 text-[11px] font-bold text-gold-400">
          Reserva en línea
        </p>
      )}
      {p.numbers.some((n) => n.photoDataUrl) && (
        <p className="mt-2 mr-1.5 inline-block rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-0.5 text-[11px] font-bold text-green-400">
          Con comprobante
        </p>
      )}
      {p.numbers.some((n) => n.status === "occupied" && !n.photoDataUrl && n.receiptRejectedAt) && (
        <p className="mt-2 mr-1.5 inline-block rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-bold text-red-400">
          Comprobante rechazado
        </p>
      )}
      {receipts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {receipts.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onViewReceipt(url)}
              aria-label={receipts.length > 1 ? `Ver comprobante ${i + 1}` : "Ver comprobante"}
              className="relative block h-16 w-16 overflow-hidden rounded-xl border border-green-500/40 transition active:scale-95"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-black/65 py-0.5 text-center text-[10px] font-bold text-white">Ver</span>
            </button>
          ))}
        </div>
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
                  : "border border-gold-600/60 bg-gold-400/10 text-gold-400"
              }`}
            >
              {h.kind === "set" ? `Conjunto ${h.group.label}` : formatNumberValue(h.number.value)}
              {stageSettings && h.kind === "number" && !paid && (
                <span className="ml-1.5 text-[11px] font-semibold opacity-80">{quotaBadge(h.number.quotas, stageSettings)}</span>
              )}
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
                aria-label={
                  stageMoney
                    ? `Cobrar cuotas · ${formatCurrency(stageMoney.due > 0 ? stageMoney.due : stageMoney.next)}`
                    : `${pendingItems === 1 ? "Marcar como pagado" : `Cobrar los ${pendingItems} pendientes`} · ${formatCurrency(owes)}`
                }
                className="flex h-11 min-w-0 flex-[1.3] items-center justify-center rounded-xl border border-green-500/40 bg-green-500/10 px-3 text-sm font-semibold text-green-400 transition active:scale-[0.98]"
              >
                <span aria-hidden="true" className="truncate sm:hidden">
                  {stageMoney ? "Cobrar cuota" : pendingItems === 1 ? "Cobrar" : "Cobrar todo"}
                </span>
                <span aria-hidden="true" className="hidden truncate sm:inline">
                  {stageMoney
                    ? `Cobrar cuota · ${formatCurrency(stageMoney.due > 0 ? stageMoney.due : stageMoney.next)}`
                    : `${pendingItems === 1 ? "Marcar como pagado" : `Cobrar los ${pendingItems} pendientes`} · ${formatCurrency(owes)}`}
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

/** "Llevas 2 de 3 cuotas." (or per number when they differ), for the receipt of a raffle by stages. */
function stageProgress(numbers: RaffleNumberDTO[], settings: StageSettings): string {
  const total = installmentPrices(settings.stages).length;
  const counts = new Set(numbers.map((n) => n.quotas.length));
  if (counts.size === 1) {
    const paid = numbers[0]!.quotas.length;
    return paid === total ? "¡Ya pagaste todas las cuotas!" : `Llevas ${paid} de ${total} cuotas.`;
  }
  return `Cuotas pagadas: ${numbers.map((n) => `${formatNumberValue(n.value)} (${n.quotas.length}/${total})`).join(", ")}.`;
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
        active ? "bg-gold-300 text-[#241a02]" : "border border-line bg-surface-2 text-text-muted"
      }`}
    >
      {children}
    </button>
  );
}
