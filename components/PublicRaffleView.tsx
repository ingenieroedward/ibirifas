"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { darken, lighten, withAlpha } from "@/lib/color";
import { drawPlanOf } from "@/lib/drawPlan";
import { formatCurrency, formatDrawDate, formatNumberValue } from "@/lib/format";
import {
  amountDueNow,
  currentStage,
  installmentPrices,
  lastPayDay,
  paidStages,
  sortedStages,
  stagesPrizeSummary,
  totalPrice,
} from "@/lib/stages";
import { pageThemeStyle, tileTextColor } from "@/lib/theme";
import type { PublicRaffleDTO } from "@/lib/types";
import { CrownIcon } from "@/components/icons/Crown";
import { CopyButton } from "@/components/CopyButton";
import { ReceiptSheet } from "@/components/ReceiptSheet";
import { ReserveSheet } from "@/components/ReserveSheet";
import { myReservations, reservationPath } from "@/lib/myReservations";

const REFRESH_MS = 20_000;

/**
 * The raffle as a buyer sees it: prize, prices, where to pay and which numbers
 * (or letters) are still free. Read-only and anonymous; refreshes itself.
 */
export function PublicRaffleView({ token, initial }: { token: string; initial: PublicRaffleDTO }) {
  const [raffle, setRaffle] = useState(initial);
  const [gone, setGone] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/raffles/${token}`, { cache: "no-store" });
      if (res.status === 404) {
        setGone(true);
        return;
      }
      if (res.ok) {
        setGone(false);
        setRaffle((await res.json()) as PublicRaffleDTO);
      }
    } catch {
      // Offline: keep showing the last known state.
    }
  }, [token]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  // What the visitor has picked to reserve (only used when the raffle allows reservations).
  const [pickedNumbers, setPickedNumbers] = useState<Set<number>>(new Set());
  const [pickedSets, setPickedSets] = useState<Set<string>>(new Set());
  // Frozen when the sheet opens: the picks become sold (ours) while the sheet still shows the confirmation.
  const [reserving, setReserving] = useState<{ numbers: number[]; sets: string[]; total: number } | null>(null);
  const [limitNote, setLimitNote] = useState<string | null>(null);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  // Reservations made from this device (newest first), linking to "Mi reserva". Read after mount: the
  // server render can't see this browser's storage.
  const [mine, setMine] = useState<string[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMine(myReservations(token));
  }, [token, reserving]);

  const hasSets = raffle.groups.length > 0;
  const closed = raffle.status === "closed";
  const byStages = raffle.stages.length > 0;
  const nextStage = byStages ? currentStage(raffle.stages) : null;
  const basePlan = drawPlanOf({
    drawDate: raffle.drawDate,
    drawTrigger: raffle.drawTrigger,
    soldCount: raffle.soldCount,
    paidCount: raffle.paidCount,
    totalNumbers: raffle.totalNumbers,
  });
  // A raffle by stages talks about its next draw.
  const plan = nextStage
    ? { ...basePlan, line: `Próximo: ${nextStage.label}${nextStage.drawDate ? ` el ${formatDrawDate(nextStage.drawDate)}` : ""}` }
    : basePlan;
  const lotteryText = nextStage?.lottery || raffle.lottery;
  // What a number taken today must pay to play the next draw (its first installments).
  const perNumberNow = byStages ? amountDueNow([], raffle.stages) : raffle.numberPrice;
  const canReserve = raffle.reservations.open && !closed;
  const { maxLoose, maxSets } = raffle.reservations;

  // Someone else may take a pick while the page is open: only what is still free counts.
  const freeNumbers = useMemo(() => new Set(raffle.numbers.filter((n) => !n.sold).map((n) => n.value)), [raffle.numbers]);
  const freeSets = useMemo(() => new Set(raffle.groups.filter((g) => !g.sold).map((g) => g.label)), [raffle.groups]);
  const numbersPicked = [...pickedNumbers].filter((v) => freeNumbers.has(v)).sort((a, b) => a - b);
  const setsPicked = [...pickedSets].filter((l) => freeSets.has(l)).sort();
  const pickedTotal =
    numbersPicked.length * raffle.numberPrice +
    setsPicked.reduce((sum, l) => sum + (raffle.groups.find((g) => g.label === l)?.price ?? 0), 0);
  const pickedCount = numbersPicked.length + setsPicked.length;

  const toggleNumber = (value: number) => {
    setLimitNote(null);
    if (numbersPicked.includes(value)) setPickedNumbers(new Set(numbersPicked.filter((v) => v !== value)));
    else if (numbersPicked.length >= maxLoose) setLimitNote(`Puedes reservar hasta ${maxLoose} números a la vez.`);
    else setPickedNumbers(new Set([...numbersPicked, value]));
  };
  const toggleSet = (label: string) => {
    setLimitNote(null);
    if (setsPicked.includes(label)) setPickedSets(new Set(setsPicked.filter((l) => l !== label)));
    else if (setsPicked.length >= maxSets) setLimitNote(`Puedes reservar hasta ${maxSets} conjuntos a la vez.`);
    else setPickedSets(new Set([...setsPicked, label]));
  };

  const available = raffle.numbers.filter((n) => !n.sold).length;
  const loose = useMemo(() => raffle.numbers.filter((n) => n.group === null), [raffle.numbers]);
  const looseFree = loose.filter((n) => !n.sold).length;

  const setPrices = raffle.groups.map((g) => g.price);
  const priceText = hasSets
    ? Math.min(...setPrices) === Math.max(...setPrices)
      ? formatCurrency(setPrices[0]!)
      : `${formatCurrency(Math.min(...setPrices))} – ${formatCurrency(Math.max(...setPrices))}`
    : formatCurrency(raffle.numberPrice);

  const tileStyle: CSSProperties | undefined = raffle.themeNumberColor
    ? {
        backgroundImage: `linear-gradient(to bottom, ${lighten(raffle.themeNumberColor, 0.22)}, ${raffle.themeNumberColor})`,
        color: tileTextColor(raffle.themeNumberColor, raffle.themeTextColor),
        boxShadow: `0 0 0 1px ${withAlpha(darken(raffle.themeNumberColor, 0.1), 0.18)} inset`,
      }
    : undefined;

  const freeTile = "bg-gradient-to-b from-gold-300 to-gold-500 text-on-accent shadow-gold";
  const soldTile = "border border-line bg-surface-2 text-text-muted line-through decoration-2 opacity-60";

  return (
    <div
      className="flex min-h-dvh flex-1 flex-col pb-12"
      style={pageThemeStyle({ background: raffle.themeBackground, numberColor: raffle.themeNumberColor })}
    >
      <header className="px-4 pt-safe sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-center justify-center gap-2 py-5">
            <CrownIcon className="h-5 w-8 text-gold-400" />
            <span className="font-[family-name:var(--font-heading)] text-lg font-bold text-gold-400">Ibirifas</span>
          </div>

          <h1 className="text-center font-[family-name:var(--font-heading)] text-3xl font-extrabold leading-tight text-text">
            {raffle.name}
          </h1>

          {gone && (
            <p role="status" className="mt-3 rounded-xl border border-gold-600/50 bg-gold-400/10 px-4 py-2 text-center text-sm text-gold-400">
              Este enlace ya no está activo. Lo que ves puede estar desactualizado.
            </p>
          )}

          {closed && (
            <div role="status" className="mt-4 rounded-2xl border border-gold-600/50 bg-gold-400/10 p-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-400">Rifa cerrada</p>
              {byStages ? (
                <p className="mt-1 text-sm text-text-muted">Se jugaron todos los sorteos: mira los resultados abajo.</p>
              ) : raffle.winnerValue !== null && (
                <p className="mt-1 font-[family-name:var(--font-heading)] text-xl font-extrabold text-text">
                  Ganó el <span className="text-3xl text-gold-400">{formatNumberValue(raffle.winnerValue)}</span>
                </p>
              )}
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-2xl border border-gold-600/30 bg-bg-elevated shadow-card">
            <div className="flex divide-x divide-line">
              <div className="flex-1 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Premio</p>
                <p className="mt-0.5 break-words font-[family-name:var(--font-heading)] text-xl font-extrabold text-gold-400">
                  {raffle.prizeLabel || stagesPrizeSummary(raffle.stages) || "Por definir"}
                </p>
              </div>
              <div className="flex-1 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {hasSets ? "Valor del conjunto" : "Valor del número"}
                </p>
                <p className="mt-0.5 break-words font-[family-name:var(--font-heading)] text-xl font-extrabold text-gold-400">
                  {priceText}
                </p>
                {hasSets && loose.length > 0 && (
                  <p className="text-xs text-text-muted">Suelto: {formatCurrency(raffle.numberPrice)}</p>
                )}
                {byStages && (
                  <p className="text-xs text-text-muted">
                    {(() => {
                      const prices = installmentPrices(raffle.stages);
                      return new Set(prices).size === 1
                        ? `${prices.length} cuotas de ${formatCurrency(prices[0]!)}`
                        : `Cuotas: ${prices.map(formatCurrency).join(" + ")}`;
                    })()}
                  </p>
                )}
              </div>
            </div>
            {(plan.line || lotteryText) && (
              <p className="border-t border-line px-4 py-2.5 text-center text-sm text-text-muted">
                {plan.line ?? "Sorteo"}
                {lotteryText && ` · ${lotteryText}`}
              </p>
            )}
            {plan.progress && (
              <div className="border-t border-line px-4 py-2.5" aria-label="Avance para jugar">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>
                    {plan.progress.done} de {plan.progress.total} {plan.progress.noun}
                  </span>
                  <span>{Math.round((plan.progress.done / Math.max(1, plan.progress.total)) * 100)}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-500"
                    style={{ width: `${Math.min(100, (plan.progress.done / Math.max(1, plan.progress.total)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {raffle.accounts.length > 0 && (
              <div className="space-y-1 border-t border-line px-4 py-3 text-sm text-text-muted">
                <p className="text-[11px] font-semibold uppercase tracking-wide">Cuentas de pago</p>
                {raffle.accounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between gap-3">
                    <p className="min-w-0 break-words">
                      <span className="font-semibold text-text">{account.label}</span> {account.number}
                      {account.holderName && <span> · {account.holderName}</span>}
                    </p>
                    <CopyButton text={account.number} label={`número de ${account.label}`} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="mt-4 text-center text-sm font-medium text-text">
            {closed
              ? "Esta rifa ya no recibe compradores."
              : available === 0
                ? "Ya no quedan números disponibles."
                : hasSets
                  ? `${raffle.groups.filter((g) => !g.sold).length} de ${raffle.groups.length} conjuntos disponibles${looseFree > 0 ? ` · ${looseFree} sueltos` : ""}`
                  : `${available} de ${raffle.totalNumbers} números disponibles`}
          </p>
          {!closed && available > 0 && (
            <p className="mt-1 text-center text-xs text-text-muted">
              {canReserve
                ? `Toca ${hasSets ? "las letras o los números" : "los números"} que quieras y resérvalos: tienes ${raffle.reservations.holdDays} ${raffle.reservations.holdDays === 1 ? "día" : "días"} para pagar.`
                : "Para apartar los tuyos, escríbele a quien te compartió este enlace."}
            </p>
          )}
          {(canReserve || mine.length > 0) && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {mine.length > 0 && (
                <a
                  href={reservationPath(token, mine[0]!)}
                  className="rounded-full border border-gold-600/50 bg-gold-400/10 px-4 py-2 text-xs font-semibold text-gold-400 transition active:scale-95"
                >
                  {mine.length === 1 ? "Ver mi reserva" : "Ver mi última reserva"}
                </a>
              )}
              {canReserve && (
                <button
                  type="button"
                  onClick={() => setSendingReceipt(true)}
                  className="rounded-full border border-gold-600/50 px-4 py-2 text-xs font-semibold text-gold-400 transition active:scale-95"
                >
                  Ya reservé: subir mi comprobante
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="mt-5 flex-1 px-4 sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {byStages && <PublicStages raffle={raffle} />}
          {hasSets && (
            <section aria-label="Conjuntos">
              <ul className="grid gap-3 sm:grid-cols-2">
                {raffle.groups.map((group) => {
                  const members = raffle.numbers.filter((n) => n.group === group.label);
                  return (
                    <li
                      key={group.label}
                      aria-label={`Conjunto ${group.label}, ${group.sold ? "vendido" : "disponible"}, ${formatCurrency(group.price)}`}
                      className={`rounded-2xl border bg-bg-elevated p-3.5 shadow-card ${group.sold ? "border-line" : "border-gold-600/40"}`}
                    >
                      <div
                        {...(canReserve && !group.sold
                          ? {
                              role: "button",
                              tabIndex: 0,
                              "aria-pressed": setsPicked.includes(group.label),
                              "aria-label": `Reservar conjunto ${group.label}, ${formatCurrency(group.price)}`,
                              onClick: () => toggleSet(group.label),
                              onKeyDown: (e: React.KeyboardEvent) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  toggleSet(group.label);
                                }
                              },
                            }
                          : {})}
                        className={`flex items-center gap-3 ${canReserve && !group.sold ? "cursor-pointer" : ""}`}
                      >
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-[family-name:var(--font-heading)] text-2xl font-extrabold ${group.sold ? "border border-line bg-surface-2 text-text-muted" : freeTile} ${setsPicked.includes(group.label) ? "ring-4 ring-white ring-offset-2 ring-offset-bg" : ""}`}
                          style={group.sold ? undefined : tileStyle}
                        >
                          {group.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`font-[family-name:var(--font-heading)] text-lg font-extrabold leading-tight ${group.sold ? "text-text-muted line-through" : "text-gold-400"}`}>
                            {formatCurrency(group.price)}
                          </p>
                          <p className="text-xs text-text-muted">{members.length} números</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${group.sold ? "border border-line bg-surface-2 text-text-muted" : "border border-gold-600/50 bg-gold-400/10 text-gold-400"}`}
                        >
                          {group.sold ? "Vendido" : setsPicked.includes(group.label) ? "Elegido ✓" : "Disponible"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {members.map((n) => (
                          <span
                            key={n.value}
                            className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 font-[family-name:var(--font-heading)] text-sm font-bold ${n.sold ? soldTile : freeTile}`}
                            style={n.sold ? undefined : tileStyle}
                          >
                            {formatNumberValue(n.value)}
                          </span>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {loose.length > 0 && (
            <section aria-label="Números sueltos">
              {hasSets && (
                <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-text">
                  Números sueltos · {formatCurrency(raffle.numberPrice)} c/u
                </h2>
              )}
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 sm:gap-2.5 lg:grid-cols-10">
                {loose.map((n) => {
                  const picked = numbersPicked.includes(n.value);
                  const className = `relative flex aspect-square items-center justify-center rounded-2xl font-[family-name:var(--font-heading)] text-base font-bold sm:text-lg ${n.sold ? soldTile : freeTile} ${raffle.winnerValue === n.value ? "opacity-100 ring-4 ring-gold-300 ring-offset-2 ring-offset-bg" : ""} ${picked ? "ring-4 ring-white ring-offset-2 ring-offset-bg" : ""}`;
                  if (canReserve && !n.sold) {
                    return (
                      <button
                        key={n.value}
                        type="button"
                        aria-pressed={picked}
                        aria-label={`Número ${formatNumberValue(n.value)}, disponible${picked ? ", elegido" : ""}`}
                        onClick={() => toggleNumber(n.value)}
                        className={`${className} transition active:scale-90`}
                        style={tileStyle}
                      >
                        {formatNumberValue(n.value)}
                        {picked && <span aria-hidden="true" className="absolute right-1 top-0.5 text-[11px]">✓</span>}
                      </button>
                    );
                  }
                  return (
                    <span
                      key={n.value}
                      aria-label={`Número ${formatNumberValue(n.value)}, ${n.sold ? "ocupado" : "disponible"}${raffle.winnerValue === n.value ? ", ganador" : ""}`}
                      className={className}
                      style={n.sold ? undefined : tileStyle}
                    >
                      {formatNumberValue(n.value)}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          <div className="flex items-center justify-center gap-4 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-gold-400" /> Disponible
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-line bg-surface-2" /> Vendido / apartado
            </span>
          </div>
        </div>
      </main>

      {canReserve && pickedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-safe backdrop-blur">
          <div className="mx-auto w-full max-w-3xl py-3">
            {limitNote && (
              <p role="status" className="mb-2 text-xs font-medium text-gold-400">
                {limitNote}
              </p>
            )}
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-[family-name:var(--font-heading)] text-base font-bold text-text">
                  {pickedCount} {pickedCount === 1 ? "elegido" : "elegidos"}
                </p>
                <p className="text-xs text-text-muted">
                  {formatCurrency(pickedTotal)}
                  {byStages && numbersPicked.length > 0 && ` · para el próximo sorteo: ${formatCurrency(numbersPicked.length * perNumberNow)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReserving({ numbers: numbersPicked, sets: setsPicked, total: pickedTotal })}
                className="h-12 shrink-0 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 px-6 text-sm font-bold text-on-accent shadow-gold transition active:scale-[0.98]"
              >
                Reservar
              </button>
            </div>
          </div>
        </div>
      )}

      {sendingReceipt && <ReceiptSheet token={token} onClose={() => setSendingReceipt(false)} />}

      {reserving && (
        <ReserveSheet
          token={token}
          raffle={raffle}
          numbers={reserving.numbers}
          sets={reserving.sets}
          total={reserving.total}
          onClose={(reserved) => {
            setReserving(null);
            if (reserved) {
              setPickedNumbers(new Set());
              setPickedSets(new Set());
              void refresh();
            }
          }}
        />
      )}
    </div>
  );
}

/** The draws of a raffle by stages for buyers: prizes, dates, results (numbers only) and the payment rules. */
function PublicStages({ raffle }: { raffle: PublicRaffleDTO }) {
  const stages = sortedStages(raffle.stages);
  const first = paidStages(stages)[0];
  const firstDay = first ? lastPayDay(first, raffle.stageDeadlineDays) : null;
  const total = totalPrice(stages);
  const bonus = stages.find((st) => st.bonus);
  const days = raffle.stageDeadlineDays;
  return (
    <section aria-label="Sorteos" className="space-y-3 rounded-2xl border border-line bg-bg-elevated p-4 shadow-card">
      <div>
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-text">Sorteos</h2>
        <p className="text-xs text-text-muted">Juegas con el mismo número en todos.</p>
      </div>
      <ol className="space-y-2">
        {stages.map((st) => (
          <li key={st.position} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">
                {st.bonus ? "🎁 " : ""}
                {st.label} · <span className="text-gold-400">{st.prize}</span>
              </p>
              <p className="text-xs text-text-muted">
                {st.drawDate ? formatDrawDate(st.drawDate) : "Fecha por definir"}
                {st.lottery || raffle.lottery ? ` · ${st.lottery || raffle.lottery}` : ""}
                {!st.bonus && !st.outcome && lastPayDay(st, days) ? ` · paga hasta el ${lastPayDay(st, days)}` : ""}
              </p>
            </div>
            {st.winnerValue !== null && (
              <span className="shrink-0 text-right">
                <span className="block font-[family-name:var(--font-heading)] text-xl font-extrabold text-gold-400">
                  {formatNumberValue(st.winnerValue)}
                </span>
                <span className="block text-[11px] text-text-muted">{st.outcome === "won" ? "Ganador" : "Quedó en la casa"}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
      <ul className="space-y-1 text-xs text-text-muted">
        <li>
          Cada cuota debe estar paga {days === 0 ? "a más tardar el día del sorteo" : `${days} ${days === 1 ? "día" : "días"} antes de su sorteo`}. Si sale
          un número que no está al día, el premio queda en la casa.
        </li>
        {raffle.fullPayPerk === "discount" && raffle.fullPayDiscount ? (
          <li className="font-medium text-gold-400">
            Pagando todo de una{firstDay ? ` hasta el ${firstDay}` : ""}: {formatCurrency(total - raffle.fullPayDiscount)} en vez de{" "}
            {formatCurrency(total)}.
          </li>
        ) : raffle.fullPayPerk === "draw" && bonus ? (
          <li className="font-medium text-gold-400">
            Pagando todo de una{firstDay ? ` hasta el ${firstDay}` : ""} juegas también {bonus.label}: {bonus.prize}.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
