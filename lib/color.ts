/**
 * Small hex-color helpers used for per-raffle theme overrides — deriving a
 * gradient/glow from a single organizer-picked color, without pulling in a
 * color library for what's a handful of one-line operations.
 */

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_COLOR_RE.test(value);
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = isValidHex(hex) ? hex : "#000000";
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return { r, g, b };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Mixes `hex` toward white (positive amount) or black (negative amount), 0..1. */
export function mix(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.min(1, Math.abs(amount));
  return rgbToHex(
    r + (target - r) * weight,
    g + (target - g) * weight,
    b + (target - b) * weight,
  );
}

export function lighten(hex: string, amount: number): string {
  return mix(hex, Math.abs(amount));
}

export function darken(hex: string, amount: number): string {
  return mix(hex, -Math.abs(amount));
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Relative luminance (0..1), used to pick a readable contrasting color. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
