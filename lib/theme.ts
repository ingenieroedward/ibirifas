import type { CSSProperties } from "react";
import { luminance, mix } from "@/lib/color";

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

/**
 * The page style for a raffle's background color. The app is built for a dark
 * background (light text, dark cards), so when the organizer picks a light one
 * the text tokens would vanish into it. In that case the surfaces, lines and text
 * tokens are switched to a light scheme for everything inside the page, derived
 * from the chosen color, so titles, counters, cards and sheets stay readable.
 */
export function pageThemeStyle(background: string | null | undefined): CSSProperties | undefined {
  if (!background) return undefined;
  const style: Record<string, string> = { backgroundColor: background };
  const bgLum = luminance(background);
  // Around this luminance dark text starts to read better than white on the color.
  if (bgLum >= 0.18) {
    // Mid-tones (say a gray) are hard for text of either color, so there the cards go clearly lighter
    // than the page and carry the dark text; on a really light page they only step slightly darker.
    const mid = bgLum < 0.5;
    Object.assign(style, {
      colorScheme: "light",
      "--color-bg": background,
      "--color-bg-elevated": mid ? mix(background, 0.85) : mix(background, -0.03),
      "--color-surface": mid ? mix(background, 0.9) : mix(background, -0.05),
      "--color-surface-2": mid ? mix(background, 0.78) : mix(background, -0.08),
      "--color-line": mid ? mix(background, 0.45) : mix(background, -0.22),
      "--color-text": "#15131c",
      "--color-text-muted": bgLum >= 0.4 ? "#5a556d" : "#2a2636",
      // The accents double as text, so on a light page they need deeper shades to be readable
      // (they still work as button fills, which carry dark text).
      "--color-gold-300": "#b58900",
      // Directly on a mid-tone page no gold reads well, so it turns into a deep brown there.
      "--color-gold-400": mid ? "#2f2200" : "#8f6a00",
      "--color-green-400": "#1a8f42",
      "--color-red-400": "#dc2626",
    });
  }
  return style as CSSProperties;
}
