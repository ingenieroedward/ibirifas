"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { darken, lighten, withAlpha } from "@/lib/color";
import { formatCurrency, formatDrawDate, formatNumberValue } from "@/lib/format";
import type { PublicRaffleDTO } from "@/lib/types";
import { CrownIcon } from "@/components/icons/Crown";

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

  const hasSets = raffle.groups.length > 0;
  const closed = raffle.status === "closed";
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
        color: raffle.themeTextColor || "#241a02",
        boxShadow: `0 0 0 1px ${withAlpha(darken(raffle.themeNumberColor, 0.1), 0.18)} inset`,
      }
    : undefined;

  const freeTile = "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02] shadow-gold";
  const soldTile = "border border-line bg-surface-2 text-text-muted line-through decoration-2 opacity-60";

  return (
    <div
      className="flex min-h-dvh flex-1 flex-col pb-12"
      style={raffle.themeBackground ? { backgroundColor: raffle.themeBackground } : undefined}
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
              {raffle.winnerValue !== null && (
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
                  {raffle.prizeLabel || "Por definir"}
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
              </div>
            </div>
            {(raffle.drawDate || raffle.lottery) && (
              <p className="border-t border-line px-4 py-2.5 text-center text-sm text-text-muted">
                {raffle.drawDate ? `Sorteo el ${formatDrawDate(raffle.drawDate)}` : "Sorteo"}
                {raffle.lottery && ` · ${raffle.lottery}`}
              </p>
            )}
            {raffle.accounts.length > 0 && (
              <div className="space-y-1 border-t border-line px-4 py-3 text-sm text-text-muted">
                <p className="text-[11px] font-semibold uppercase tracking-wide">Cuentas de pago</p>
                {raffle.accounts.map((account) => (
                  <p key={account.id}>
                    <span className="font-semibold text-text">{account.label}</span> {account.number}
                    {account.holderName && <span> · {account.holderName}</span>}
                  </p>
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
              Para apartar los tuyos, escríbele a quien te compartió este enlace.
            </p>
          )}
        </div>
      </header>

      <main className="mt-5 flex-1 px-4 sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-6">
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
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-[family-name:var(--font-heading)] text-2xl font-extrabold ${group.sold ? "border border-line bg-surface-2 text-text-muted" : freeTile}`}
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
                          {group.sold ? "Vendido" : "Disponible"}
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
                {loose.map((n) => (
                  <span
                    key={n.value}
                    aria-label={`Número ${formatNumberValue(n.value)}, ${n.sold ? "ocupado" : "disponible"}${raffle.winnerValue === n.value ? ", ganador" : ""}`}
                    className={`relative flex aspect-square items-center justify-center rounded-2xl font-[family-name:var(--font-heading)] text-base font-bold sm:text-lg ${n.sold ? soldTile : freeTile} ${raffle.winnerValue === n.value ? "opacity-100 ring-4 ring-gold-300 ring-offset-2 ring-offset-bg" : ""}`}
                    style={n.sold ? undefined : tileStyle}
                  >
                    {formatNumberValue(n.value)}
                  </span>
                ))}
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
    </div>
  );
}
