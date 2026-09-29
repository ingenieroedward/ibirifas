/**
 * Default grid theme, matching the hardcoded gold/black look defined in
 * app/globals.css (--color-bg, --color-gold-400) and the dark tile text color
 * used throughout components/NumberCell.tsx (`text-[#241a02]`). Organizer
 * color pickers start here, and this is also the fallback whenever a raffle
 * hasn't set a custom theme.
 */
export const DEFAULT_THEME = {
  background: "#0b0b0f",
  numberColor: "#f5c518",
  textColor: "#241a02",
} as const;

export interface RaffleTheme {
  themeBackground?: string | null;
  themeNumberColor?: string | null;
  themeTextColor?: string | null;
}

/** True when the raffle has at least one custom theme color set. */
export function hasCustomTheme(raffle: RaffleTheme): boolean {
  return Boolean(raffle.themeBackground || raffle.themeNumberColor || raffle.themeTextColor);
}

export function resolvedTheme(raffle: RaffleTheme): {
  background: string;
  numberColor: string;
  textColor: string;
} {
  return {
    background: raffle.themeBackground || DEFAULT_THEME.background,
    numberColor: raffle.themeNumberColor || DEFAULT_THEME.numberColor,
    textColor: raffle.themeTextColor || DEFAULT_THEME.textColor,
  };
}
