import type { CSSProperties } from "react";
import { darken, lighten, withAlpha } from "@/lib/color";
import { formatNumberValue } from "@/lib/format";
import type { RaffleNumberDTO } from "@/lib/types";

interface NumberCellProps {
  number: RaffleNumberDTO;
  onTap: (number: RaffleNumberDTO) => void;
  /** Custom grid theme colors, when the raffle has set any — undefined/null falls back to the default gold look. */
  themeNumberColor?: string | null;
  themeTextColor?: string | null;
  /** Only set while picking several numbers: whether this one is picked. Undefined outside selection mode. */
  selected?: boolean;
  /** In selection mode, numbers that can't be picked (already taken) are dimmed. */
  dimmed?: boolean;
}

const STATUS_CLASSES: Record<RaffleNumberDTO["status"], string> = {
  available:
    "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02] shadow-gold",
  occupied:
    "bg-surface-2 border border-line text-text-muted shadow-card",
  paid: "bg-gradient-to-b from-green-400 to-green-600 text-[#052012] shadow-green",
};

export function NumberCell({ number, onTap, themeNumberColor, themeTextColor, selected, dimmed }: NumberCellProps) {
  const hasPhoto = Boolean(number.photoDataUrl);

  // Only "available" tiles carry the organizer's custom color — occupied/paid
  // stay on their neutral/green status colors so sold numbers remain
  // distinguishable at a glance no matter what palette the raffle uses.
  const useCustomTheme = number.status === "available" && Boolean(themeNumberColor);
  const style: CSSProperties | undefined = useCustomTheme
    ? {
        backgroundImage: `linear-gradient(to bottom, ${lighten(themeNumberColor!, 0.22)}, ${themeNumberColor})`,
        color: themeTextColor || "#241a02",
        boxShadow: `0 10px 28px -10px ${withAlpha(themeNumberColor!, 0.55)}, 0 0 0 1px ${withAlpha(darken(themeNumberColor!, 0.1), 0.18)} inset`,
      }
    : undefined;

  return (
    <button
      type="button"
      onClick={() => onTap(number)}
      aria-label={`Número ${formatNumberValue(number.value)}, ${STATUS_LABEL[number.status]}${selected ? ", seleccionado" : ""}`}
      aria-pressed={selected === undefined ? undefined : selected}
      style={style}
      className={`relative flex aspect-square select-none items-center justify-center rounded-2xl font-[family-name:var(--font-heading)] text-base font-bold transition active:scale-90 sm:text-lg ${useCustomTheme ? "" : STATUS_CLASSES[number.status]} ${dimmed ? "opacity-30" : ""} ${selected ? "scale-95 ring-4 ring-white ring-offset-2 ring-offset-bg" : ""}`}
    >
      {formatNumberValue(number.value)}
      {selected && (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-black text-[#241a02] shadow-sm"
        >
          ✓
        </span>
      )}
      {number.status !== "available" && hasPhoto && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold-400 text-[9px] text-[#241a02] shadow-sm ring-2 ring-bg"
        >
          ✓
        </span>
      )}
    </button>
  );
}

const STATUS_LABEL: Record<RaffleNumberDTO["status"], string> = {
  available: "disponible",
  occupied: "ocupado",
  paid: "pagado",
};
