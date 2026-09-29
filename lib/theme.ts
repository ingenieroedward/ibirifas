import type { CSSProperties } from "react";
import { contrastRatio, darken, ensureContrast, lighten, luminance, mix, readableText } from "@/lib/color";

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

/**
 * The color of the digits on a tile. The organizer's own choice is respected while it can be read on the
 * tile color (contrast of at least 3); a choice that can't (black on dark blue) or none at all becomes
 * white or near-black, whichever reads better. With no custom tile color the default brown stays.
 */
export function tileTextColor(numberColor: string | null | undefined, textColor: string | null | undefined): string {
  if (!numberColor) return textColor || DEFAULT_THEME.textColor;
  if (textColor && contrastRatio(textColor, numberColor) >= 3) return textColor;
  return readableText(numberColor);
}

export function resolvedTheme(raffle: RaffleTheme): {
  background: string;
  numberColor: string;
  textColor: string;
} {
  const numberColor = raffle.themeNumberColor || DEFAULT_THEME.numberColor;
  return {
    background: raffle.themeBackground || DEFAULT_THEME.background,
    numberColor,
    textColor: raffle.themeNumberColor || raffle.themeTextColor ? tileTextColor(numberColor, raffle.themeTextColor) : DEFAULT_THEME.textColor,
  };
}

/**
 * The page style for a raffle's own look on the public page. The app is built for a dark background
 * with gold as its accent, so a custom look re-points those tokens:
 * - a light (or mid-tone) background switches surfaces, lines and text to a light scheme derived from it;
 * - a custom tile color becomes the accent everywhere the gold was (prices, pills, buttons, borders),
 *   with a variant nudged until it can be read as text, and `--color-on-accent` for text on buttons.
 * Without a custom background/tile color, nothing is overridden.
 */
export function pageThemeStyle(theme: {
  background?: string | null;
  numberColor?: string | null;
}): CSSProperties | undefined {
  const { background, numberColor } = theme;
  if (!background && !numberColor) return undefined;

  const style: Record<string, string> = {};
  if (background) style.backgroundColor = background;
  const pageBg = background || DEFAULT_THEME.background;
  const bgLum = luminance(pageBg);
  let cardBg = "#131218";

  // Around this luminance dark text starts to read better than white on the color.
  const lightPage = Boolean(background) && bgLum >= 0.18;
  if (lightPage) {
    // Mid-tones (say a gray) are hard for text of either color, so there the cards go clearly lighter
    // than the page and carry the dark text; on a really light page they only step slightly darker.
    const mid = bgLum < 0.5;
    cardBg = mid ? mix(pageBg, 0.85) : mix(pageBg, -0.03);
    Object.assign(style, {
      colorScheme: "light",
      "--color-bg": pageBg,
      "--color-bg-elevated": cardBg,
      "--color-surface": mid ? mix(pageBg, 0.9) : mix(pageBg, -0.05),
      "--color-surface-2": mid ? mix(pageBg, 0.78) : mix(pageBg, -0.08),
      "--color-line": mid ? mix(pageBg, 0.45) : mix(pageBg, -0.22),
      "--color-text": "#15131c",
      "--color-text-muted": bgLum >= 0.4 ? "#5a556d" : "#2a2636",
      "--color-green-400": "#1a8f42",
      "--color-red-400": "#dc2626",
    });
  }

  if (numberColor) {
    const backgrounds = lightPage || background ? [cardBg, pageBg] : [cardBg];
    Object.assign(style, {
      "--color-gold-300": lighten(numberColor, 0.16),
      "--color-gold-400": ensureContrast(numberColor, backgrounds, 4.5),
      "--color-gold-500": darken(numberColor, 0.12),
      "--color-gold-600": numberColor,
      "--color-on-accent": readableText(numberColor),
    });
  } else if (lightPage) {
    // The default gold is unreadable as text on a light page: deeper shades.
    Object.assign(style, {
      "--color-gold-300": "#b58900",
      "--color-gold-400": bgLum < 0.5 ? "#2f2200" : "#8f6a00",
    });
  }
  return style as CSSProperties;
}
