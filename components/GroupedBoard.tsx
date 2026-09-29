"use client";

import { useMemo, type CSSProperties } from "react";
import { darken, lighten, withAlpha } from "@/lib/color";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { groupStatus } from "@/lib/groups";
import type { RaffleGroupDTO, RaffleNumberDTO } from "@/lib/types";

interface GroupedBoardProps {
  groups: RaffleGroupDTO[];
  numbers: RaffleNumberDTO[];
  onOpenGroup: (group: RaffleGroupDTO) => void;
  /** Custom grid theme colors, when the raffle has set any — omit to use the default gold look. */
  themeNumberColor?: string | null;
  themeTextColor?: string | null;
  /** The winning number of a closed raffle; the set that holds it is flagged. */
  winnerValue?: number | null;
}

const STATUS_TEXT = { available: "Disponible", occupied: "Pendiente de pago", paid: "Pagado" } as const;

/** One card per lettered set: its numbers, its price, and who has it. Tap to sell or manage it. */
export function GroupedBoard({ groups, numbers, onOpenGroup, themeNumberColor, themeTextColor, winnerValue }: GroupedBoardProps) {
  const membersByGroup = useMemo(() => {
    const map = new Map<string, RaffleNumberDTO[]>();
    for (const n of numbers) {
      if (!n.groupId) continue;
      const list = map.get(n.groupId) ?? [];
      list.push(n);
      map.set(n.groupId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.value - b.value);
    return map;
  }, [numbers]);

  const availableStyle: CSSProperties | undefined = themeNumberColor
    ? {
        backgroundImage: `linear-gradient(to bottom, ${lighten(themeNumberColor, 0.22)}, ${themeNumberColor})`,
        color: themeTextColor || "#241a02",
        boxShadow: `0 0 0 1px ${withAlpha(darken(themeNumberColor, 0.1), 0.18)} inset`,
      }
    : undefined;

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {groups.map((group) => {
        const members = membersByGroup.get(group.id) ?? [];
        const status = groupStatus(members);
        const buyer = members.find((n) => n.buyerName)?.buyerName ?? null;
        const wins = winnerValue !== null && winnerValue !== undefined && members.some((n) => n.value === winnerValue);

        return (
          <li key={group.id}>
            <button
              type="button"
              onClick={() => onOpenGroup(group)}
              aria-label={`Conjunto ${group.label}, ${STATUS_TEXT[status].toLowerCase()}, ${formatCurrency(group.price)}${wins ? ", ganador" : ""}`}
              className={`block w-full rounded-2xl border p-3.5 text-left shadow-card transition active:scale-[0.98] ${
                wins
                  ? "border-gold-300 ring-2 ring-gold-300"
                  : status === "available"
                  ? "border-gold-600/40 bg-bg-elevated"
                  : status === "paid"
                    ? "border-green-500/40 bg-bg-elevated"
                    : "border-line bg-bg-elevated"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-[family-name:var(--font-heading)] text-2xl font-extrabold ${
                    status === "available"
                      ? "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02]"
                      : status === "paid"
                        ? "bg-gradient-to-b from-green-400 to-green-600 text-[#052012]"
                        : "border border-line bg-surface-2 text-text-muted"
                  }`}
                  style={status === "available" ? availableStyle : undefined}
                >
                  {group.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-[family-name:var(--font-heading)] text-lg font-extrabold leading-tight text-gold-400">
                    {formatCurrency(group.price)}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {members.length} {members.length === 1 ? "número" : "números"}
                    {buyer && ` · ${buyer}`}
                  </p>
                  {wins && (
                    <p className="text-xs font-bold text-gold-400">
                      Ganó el {formatNumberValue(winnerValue!)}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    status === "available"
                      ? "border border-gold-600/50 bg-gold-400/10 text-gold-400"
                      : status === "paid"
                        ? "border border-green-500/40 bg-green-500/10 text-green-400"
                        : "border border-line bg-surface-2 text-text-muted"
                  }`}
                >
                  {STATUS_TEXT[status]}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {members.map((n) => (
                  <span
                    key={n.id}
                    className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 font-[family-name:var(--font-heading)] text-sm font-bold ${
                      n.status === "paid"
                        ? "bg-gradient-to-b from-green-400 to-green-600 text-[#052012]"
                        : n.status === "occupied"
                          ? "border border-line bg-surface-2 text-text-muted"
                          : "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02]"
                    }`}
                    style={n.status === "available" ? availableStyle : undefined}
                  >
                    {formatNumberValue(n.value)}
                  </span>
                ))}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
