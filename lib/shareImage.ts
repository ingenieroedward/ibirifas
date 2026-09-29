import { darken, lighten, luminance, withAlpha } from "@/lib/color";
import { formatCurrency, formatDate, formatNumberValue } from "@/lib/format";
import { DEFAULT_THEME, resolvedTheme } from "@/lib/theme";
import type { RaffleDTO } from "@/lib/types";

/**
 * Renders a shareable "which numbers are still available" poster as a PNG,
 * built to sit next to the raffle-flyer poster this app's whole look was
 * modeled on: dark ground, bold brush-gold headline type, a crown motif,
 * glossy rounded gold number tiles and a "designed poster" composition —
 * not a data export. See app/globals.css (--shadow-gold/-lg tokens) and
 * components/NumberCell.tsx for the on-screen version of the same look.
 * Client-side only — never touches the server.
 */

const CANVAS_WIDTH = 1080;
const SIDE_PADDING = 56;
const GRID_GAP = 14;
const MAX_CELL_SIZE = 140;
const MIN_CELL_SIZE = 36;

// Same brush-gold crown path as components/icons/Crown.tsx (viewBox 64x40),
// redrawn on canvas since SVG components can't be reused directly here.
const CROWN_PATH = "M4 34 L0 10 L14 20 L22 4 L32 16 L42 4 L50 20 L64 10 L60 34 Z";

// Generic bold sans fallback, used only if the app's real fonts (below)
// aren't available for some reason (never expected in practice).
const FALLBACK_HEADING_FONT = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const FALLBACK_BODY_FONT = FALLBACK_HEADING_FONT;

/**
 * Reads the app's real brand font off the page's own CSS custom property —
 * next/font/google (see app/layout.tsx) already self-hosts Baloo 2 (headings)
 * and Inter (body) and exposes them as `--font-heading`/`--font-body` on
 * <html>, and the on-screen UI already renders text in them before this ever
 * runs. Using that same resolved family in canvas ties the poster's
 * typography back to the app's actual brand font instead of a generic
 * system fallback, with no extra network request needed.
 */
function getBrandFontFamily(cssVar: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

/** Waits for any in-flight web font loads to settle, best-effort only. */
async function ensureFontsReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.ready;
  } catch {
    // Worst case the canvas falls back to whatever font is already loaded.
  }
}

function pickColumns(total: number): number {
  if (total <= 20) return 4;
  if (total <= 50) return 5;
  // 10 per row is the sweet spot for the common 100-number raffle — it's
  // also the layout the reference brand poster itself uses.
  if (total <= 500) return 10;
  if (total <= 800) return 12;
  return 14;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  // Manual fallback for runtimes without CanvasRenderingContext2D#roundRect.
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Single-line "shrink to fit, then truncate" sizing, used for short labels/values. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  weight: string,
  fontFamily: string,
): { fontSize: number; text: string } {
  let fontSize = maxSize;
  while (fontSize > minSize) {
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) {
      return { fontSize, text };
    }
    fontSize -= 2;
  }
  ctx.font = `${weight} ${minSize}px ${fontFamily}`;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return { fontSize: minSize, text: truncated.length < text.length ? `${truncated}…` : truncated };
}

/** Greedy word-wrap of `text` into as many lines as it takes at the current `ctx.font`. */
function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Fits a headline into at most `maxLines` lines, picking the largest font
 * size (stepping down from `maxSize` to `minSize`) at which every line fits
 * `maxWidth`. Only once even the smallest size still overflows `maxLines`
 * does it fold the remainder into a truncated last line — so a long raffle
 * name gets to wrap onto a second line instead of shrinking to a sliver or
 * losing words to an ellipsis, the way a real poster headline would.
 */
function fitHeadline(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  maxSize: number,
  minSize: number,
  weight: string,
  fontFamily: string,
): { fontSize: number; lines: string[] } {
  for (let fontSize = maxSize; fontSize >= minSize; fontSize -= 2) {
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    const lines = wrapWords(ctx, text, maxWidth);
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) {
      return { fontSize, lines };
    }
  }

  ctx.font = `${weight} ${minSize}px ${fontFamily}`;
  const wrapped = wrapWords(ctx, text, maxWidth);
  const head = wrapped.slice(0, maxLines - 1);
  const rest = wrapped.slice(maxLines - 1).join(" ");
  let truncated = rest;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  const lastLine = truncated.length < rest.length ? `${truncated}…` : truncated;
  return { fontSize: minSize, lines: [...head, lastLine] };
}

function drawCrown(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  top: number,
  width: number,
  color: string,
  rotationDeg = 0,
  opacity = 1,
): number {
  const scale = width / 64;
  const height = 40 * scale;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(centerX, top + height / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(CROWN_PATH));
  drawRoundedRect(ctx, 2, 34, 60, 5, 2);
  ctx.fill();
  ctx.restore();
  return height;
}

/** A small 24x24-viewBox calendar glyph, echoing DashboardHeader's CalendarIcon. */
function drawCalendarIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const scale = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawRoundedRect(ctx, 3, 5, 18, 16, 2.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(3, 10.5);
  ctx.lineTo(21, 10.5);
  ctx.moveTo(8, 3);
  ctx.lineTo(8, 7);
  ctx.moveTo(16, 3);
  ctx.lineTo(16, 7);
  ctx.stroke();
  ctx.restore();
}

/** A die with three pips, used as the "lotería" badge glyph (the official draw this raffle rides on). */
function drawDiceIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const scale = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawRoundedRect(ctx, 3, 3, 18, 18, 4);
  ctx.stroke();
  ctx.fillStyle = color;
  for (const [x, y] of [
    [7.5, 7.5],
    [12, 12],
    [16.5, 16.5],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A small wallet glyph, echoing DashboardHeader's WalletIcon, for payment-account chips. */
function drawWalletIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const scale = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawRoundedRect(ctx, 2, 5, 20, 14, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(16.5, 12, 1.7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Prebuilds one "available" tile look at the grid's actual cell size, so the
 * expensive gradient/gloss work happens once per render instead of once per
 * tile — a raffle can have up to 1000 tiles. Real dimensionality (not a flat
 * fill): a three-stop "candy" gradient, a glossy specular highlight near the
 * top like a rounded plastic/glass button, an inner shadow grounding the
 * bottom edge, and a crisp darker bevel outline.
 */
function buildAvailableTileSprite(cellSize: number, radius: number, baseColor: string): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  const size = Math.max(1, Math.ceil(cellSize));
  sprite.width = size;
  sprite.height = size;
  const sctx = sprite.getContext("2d");
  if (!sctx) return sprite;

  drawRoundedRect(sctx, 0, 0, cellSize, cellSize, radius);
  sctx.save();
  sctx.clip();

  const base = sctx.createLinearGradient(0, 0, 0, cellSize);
  base.addColorStop(0, lighten(baseColor, 0.4));
  base.addColorStop(0.48, lighten(baseColor, 0.04));
  base.addColorStop(1, darken(baseColor, 0.18));
  sctx.fillStyle = base;
  sctx.fillRect(0, 0, cellSize, cellSize);

  const gloss = sctx.createRadialGradient(
    cellSize * 0.5,
    cellSize * 0.26,
    cellSize * 0.04,
    cellSize * 0.5,
    cellSize * 0.26,
    cellSize * 0.65,
  );
  gloss.addColorStop(0, "rgba(255,255,255,0.55)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  sctx.fillStyle = gloss;
  sctx.fillRect(0, 0, cellSize, cellSize);

  const innerShadow = sctx.createLinearGradient(0, cellSize * 0.55, 0, cellSize);
  innerShadow.addColorStop(0, "rgba(0,0,0,0)");
  innerShadow.addColorStop(1, "rgba(0,0,0,0.3)");
  sctx.fillStyle = innerShadow;
  sctx.fillRect(0, 0, cellSize, cellSize);
  sctx.restore();

  drawRoundedRect(sctx, 0.75, 0.75, cellSize - 1.5, cellSize - 1.5, radius);
  sctx.strokeStyle = withAlpha(darken(baseColor, 0.35), 0.55);
  sctx.lineWidth = 1.5;
  sctx.stroke();

  return sprite;
}

/** Same treatment as the available sprite, muted, for sold/occupied tiles. */
function buildSoldTileSprite(
  cellSize: number,
  radius: number,
  fill: string,
  border: string,
): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  const size = Math.max(1, Math.ceil(cellSize));
  sprite.width = size;
  sprite.height = size;
  const sctx = sprite.getContext("2d");
  if (!sctx) return sprite;

  drawRoundedRect(sctx, 0, 0, cellSize, cellSize, radius);
  sctx.save();
  sctx.clip();
  sctx.fillStyle = fill;
  sctx.fillRect(0, 0, cellSize, cellSize);
  const shade = sctx.createLinearGradient(0, 0, 0, cellSize);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.24)");
  sctx.fillStyle = shade;
  sctx.fillRect(0, 0, cellSize, cellSize);
  sctx.restore();

  drawRoundedRect(sctx, 0.75, 0.75, cellSize - 1.5, cellSize - 1.5, radius);
  sctx.strokeStyle = border;
  sctx.lineWidth = 1.5;
  sctx.stroke();

  return sprite;
}

/**
 * Full-bleed background art: a base fill plus layered radial glows (top and
 * bottom, echoing each other for balance), a vignette that darkens the far
 * corners, and a handful of soft "bokeh" points standing in for the
 * reference poster's distant city lights — texture and depth instead of one
 * flat fill, with no external image to load. Deterministic (not
 * `Math.random`), so the same raffle always renders identically.
 */
function drawBackgroundArt(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: string,
  accent: string,
  dark: boolean,
): void {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const topGlow = ctx.createRadialGradient(width / 2, height * 0.05, 10, width / 2, height * 0.05, width * 0.75);
  topGlow.addColorStop(0, withAlpha(accent, dark ? 0.3 : 0.16));
  topGlow.addColorStop(1, withAlpha(accent, 0));
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, width, Math.min(height, height * 0.45));

  const bottomGlow = ctx.createRadialGradient(width / 2, height, 10, width / 2, height, width * 0.6);
  bottomGlow.addColorStop(0, withAlpha(accent, dark ? 0.16 : 0.08));
  bottomGlow.addColorStop(1, withAlpha(accent, 0));
  ctx.fillStyle = bottomGlow;
  ctx.fillRect(0, Math.max(0, height * 0.55), width, height * 0.45);

  const vignette = ctx.createRadialGradient(
    width / 2,
    height * 0.4,
    height * 0.2,
    width / 2,
    height * 0.4,
    height * 0.78,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, dark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.1)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const bokeh: { x: number; y: number; r: number; a: number }[] = [
    { x: 0.1, y: 0.04, r: 0.05, a: 0.11 },
    { x: 0.89, y: 0.06, r: 0.035, a: 0.1 },
    { x: 0.05, y: 0.2, r: 0.022, a: 0.08 },
    { x: 0.95, y: 0.26, r: 0.03, a: 0.09 },
    { x: 0.07, y: 0.92, r: 0.045, a: 0.08 },
    { x: 0.93, y: 0.9, r: 0.05, a: 0.09 },
  ];
  for (const spot of bokeh) {
    const r = width * spot.r;
    const g = ctx.createRadialGradient(width * spot.x, height * spot.y, 0, width * spot.x, height * spot.y, r);
    g.addColorStop(0, withAlpha(accent, spot.a));
    g.addColorStop(1, withAlpha(accent, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(width * spot.x, height * spot.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export async function generateRaffleShareImage(raffle: RaffleDTO): Promise<Blob> {
  await ensureFontsReady();

  const theme = resolvedTheme(raffle);
  const total = raffle.numbers.length || raffle.totalNumbers;
  const sorted = [...raffle.numbers].sort((a, b) => a.value - b.value);

  const headingFont = getBrandFontFamily("--font-heading", FALLBACK_HEADING_FONT);
  const bodyFont = getBrandFontFamily("--font-body", FALLBACK_BODY_FONT);

  const columns = pickColumns(total);
  const rows = Math.max(1, Math.ceil(sorted.length / columns));
  const availWidth = CANVAS_WIDTH - SIDE_PADDING * 2;
  const rawCell = (availWidth - (columns - 1) * GRID_GAP) / columns;
  const cellSize = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, rawCell));
  const gridWidth = columns * cellSize + (columns - 1) * GRID_GAP;
  const gridStartX = (CANVAS_WIDTH - gridWidth) / 2;

  // A throwaway context used purely to measure text before the real canvas
  // (whose height depends on that measurement) is sized. Nothing is drawn to
  // it — it exists only so `fitHeadline`/`fitFontSize` have a `ctx` to call
  // `measureText` on ahead of time, keeping the whole layout deterministic.
  const measurer = document.createElement("canvas").getContext("2d");
  if (!measurer) throw new Error("No se pudo crear el lienzo para la imagen.");

  const HEADER_TOP = 48;
  const CROWN_WIDTH = 104;
  const CROWN_HEIGHT = (40 * CROWN_WIDTH) / 64;
  const TITLE_GAP = 22;
  const TITLE_MAX_SIZE = 58;
  const TITLE_MIN_SIZE = 30;
  const TITLE_MAX_LINES = 2;
  const TITLE_LINE_HEIGHT = 1.1;
  const UNDERLINE_GAP = 14;
  const UNDERLINE_HEIGHT = 8;
  const KICKER_GAP = 20;
  const KICKER_HEIGHT = 46;
  const HERO_GAP = 26;
  const HERO_TOP_HEIGHT = 132;
  const HERO_META_HEIGHT = 54;
  const ACCOUNTS_GAP = 18;
  // 2 per row (not 3): a chip carrying "Label number · Responsable: Name" needs
  // real width to stay legible instead of truncating the one detail — the
  // payee's name — that buyers actually need to read.
  const ACCOUNTS_PER_ROW = 2;
  const ACCOUNT_CHIP_HEIGHT = 44;
  const ACCOUNT_ROW_GAP = 12;
  const DIVIDER_GAP = 26;
  const LEGEND_HEIGHT = 32;
  const GRID_TOP_GAP = 30;
  const GRID_BOTTOM_GAP = 46;
  const FOOTER_HEIGHT = 92;

  const titleMaxWidth = CANVAS_WIDTH - SIDE_PADDING * 2;
  const { fontSize: titleSize, lines: titleLines } = fitHeadline(
    measurer,
    raffle.name,
    titleMaxWidth,
    TITLE_MAX_LINES,
    TITLE_MAX_SIZE,
    TITLE_MIN_SIZE,
    "800",
    headingFont,
  );
  const titleLineHeight = titleSize * TITLE_LINE_HEIGHT;
  const titleBlockHeight = titleLines.length * titleLineHeight;

  // Hero fact banner: premio (big) + valor (smaller) side by side, echoing
  // the reference poster's two-column banner instead of treating every fact
  // as an equal-weight column. Fecha/lotería fold into one slim meta line
  // below it, omitted entirely when neither is set.
  const hasPrize = Boolean(raffle.prizeLabel);
  const hasMeta = Boolean(raffle.drawDate || raffle.lottery);
  const heroHeight = HERO_TOP_HEIGHT + (hasMeta ? HERO_META_HEIGHT : 0);

  const accountsCount = raffle.accounts.length;
  const accountsRows = accountsCount > 0 ? Math.ceil(accountsCount / ACCOUNTS_PER_ROW) : 0;
  const accountsHeight =
    accountsRows > 0 ? accountsRows * ACCOUNT_CHIP_HEIGHT + (accountsRows - 1) * ACCOUNT_ROW_GAP : 0;

  const headerHeight =
    HEADER_TOP +
    CROWN_HEIGHT +
    TITLE_GAP +
    titleBlockHeight +
    UNDERLINE_GAP +
    UNDERLINE_HEIGHT +
    KICKER_GAP +
    KICKER_HEIGHT +
    HERO_GAP +
    heroHeight +
    (accountsRows > 0 ? ACCOUNTS_GAP + accountsHeight : 0) +
    DIVIDER_GAP +
    LEGEND_HEIGHT;

  const gridHeight = rows * cellSize + (rows - 1) * GRID_GAP;
  const canvasHeight = headerHeight + GRID_TOP_GAP + gridHeight + GRID_BOTTOM_GAP + FOOTER_HEIGHT;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = Math.ceil(canvasHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el lienzo para la imagen.");

  const dark = luminance(theme.background) < 0.5;
  const mutedText = dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)";
  const soldTileFill = dark ? lighten(theme.background, 0.14) : darken(theme.background, 0.08);
  const soldTileBorder = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const soldMark = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";

  drawBackgroundArt(ctx, canvas.width, canvas.height, theme.background, theme.numberColor, dark);

  // Thin gold frame around the whole poster — a small touch that reads as
  // "someone designed this card" rather than a raw canvas export.
  ctx.strokeStyle = withAlpha(theme.numberColor, 0.22);
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 6, 6, canvas.width - 12, canvas.height - 12, 28);
  ctx.stroke();

  let cursorY = HEADER_TOP;

  // Main crown, flanked by two small mirrored flourish crowns near the
  // corners — echoing the reference poster's little crown accents instead of
  // a single centered mark sitting in isolation.
  drawCrown(ctx, CANVAS_WIDTH / 2, cursorY, CROWN_WIDTH, theme.numberColor);
  drawCrown(ctx, SIDE_PADDING + 18, cursorY + 6, 30, theme.numberColor, -18, 0.55);
  drawCrown(ctx, CANVAS_WIDTH - SIDE_PADDING - 18, cursorY + 6, 30, theme.numberColor, 18, 0.55);
  cursorY += CROWN_HEIGHT + TITLE_GAP;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${titleSize}px ${headingFont}`;
  ctx.fillStyle = theme.numberColor;
  ctx.shadowColor = withAlpha(theme.numberColor, dark ? 0.5 : 0.25);
  ctx.shadowBlur = titleSize * 0.35;
  let widestLineWidth = 0;
  titleLines.forEach((line, i) => {
    const y = cursorY + titleLineHeight * i + titleSize * 0.78;
    ctx.fillText(line, CANVAS_WIDTH / 2, y);
    widestLineWidth = Math.max(widestLineWidth, ctx.measureText(line).width);
  });
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  cursorY += titleBlockHeight + UNDERLINE_GAP;

  // Brush-stroke underline beneath the headline, echoing the reference
  // poster's gold swoosh accents under its title type.
  ctx.save();
  ctx.translate(CANVAS_WIDTH / 2, cursorY + UNDERLINE_HEIGHT / 2);
  ctx.rotate((-1.4 * Math.PI) / 180);
  const underlineWidth = Math.min(widestLineWidth * 0.62, titleMaxWidth * 0.5);
  drawRoundedRect(ctx, -underlineWidth / 2, -UNDERLINE_HEIGHT / 2, underlineWidth, UNDERLINE_HEIGHT, UNDERLINE_HEIGHT / 2);
  ctx.fillStyle = withAlpha(theme.numberColor, 0.8);
  ctx.fill();
  ctx.restore();
  cursorY += UNDERLINE_HEIGHT + KICKER_GAP;

  // Kicker banner: total number count as a small pill, giving the header a
  // two-tier hierarchy (headline, then a bold supporting fact) instead of
  // jumping straight from the title into the info card.
  {
    const kickerLabel = `${total} NÚMEROS`;
    const { fontSize, text } = fitFontSize(ctx, kickerLabel, gridWidth * 0.7, 24, 15, "700", headingFont);
    const kickerPaddingX = 22;
    const kickerWidth = Math.min(gridWidth, ctx.measureText(text).width + kickerPaddingX * 2);
    const kickerX = (CANVAS_WIDTH - kickerWidth) / 2;
    const kickerY = cursorY + (KICKER_HEIGHT - 40) / 2;
    drawRoundedRect(ctx, kickerX, kickerY, kickerWidth, 40, 20);
    ctx.fillStyle = withAlpha(theme.numberColor, dark ? 0.16 : 0.12);
    ctx.fill();
    ctx.strokeStyle = withAlpha(theme.numberColor, 0.55);
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, kickerX, kickerY, kickerWidth, 40, 20);
    ctx.stroke();
    ctx.fillStyle = theme.numberColor;
    ctx.font = `700 ${fontSize}px ${headingFont}`;
    ctx.textAlign = "center";
    ctx.fillText(text, CANVAS_WIDTH / 2, kickerY + 40 / 2 + fontSize * 0.35);
  }
  cursorY += KICKER_HEIGHT + HERO_GAP;

  // Hero banner: bordered, glowing card like the previous facts card, but
  // with premio and valor as an unequal two-column split — premio gets the
  // big, bold treatment, valor a visibly smaller one — instead of every
  // fact reading at the same weight.
  drawRoundedRect(ctx, gridStartX, cursorY, gridWidth, heroHeight, 24);
  ctx.fillStyle = dark ? withAlpha("#000000", 0.32) : withAlpha("#ffffff", 0.55);
  ctx.fill();
  ctx.strokeStyle = withAlpha(theme.numberColor, 0.4);
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, gridStartX, cursorY, gridWidth, heroHeight, 24);
  ctx.stroke();

  const valorText = formatCurrency(raffle.numberPrice);

  if (hasPrize) {
    const splitX = gridStartX + gridWidth * 0.62;

    ctx.strokeStyle = withAlpha(dark ? "#ffffff" : "#000000", 0.14);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(splitX, cursorY + 20);
    ctx.lineTo(splitX, cursorY + HERO_TOP_HEIGHT - 20);
    ctx.stroke();

    const premioCenterX = gridStartX + (splitX - gridStartX) / 2;
    const valorCenterX = splitX + (gridStartX + gridWidth - splitX) / 2;

    ctx.textAlign = "center";
    ctx.font = `700 15px ${bodyFont}`;
    ctx.fillStyle = mutedText;
    ctx.fillText("PREMIO", premioCenterX, cursorY + 32);

    const premioMaxWidth = splitX - gridStartX - 40;
    const { fontSize: premioSize, text: premioText } = fitFontSize(
      ctx,
      raffle.prizeLabel!,
      premioMaxWidth,
      42,
      24,
      "800",
      headingFont,
    );
    ctx.font = `800 ${premioSize}px ${headingFont}`;
    ctx.fillStyle = theme.numberColor;
    ctx.fillText(premioText, premioCenterX, cursorY + HERO_TOP_HEIGHT - 28);

    ctx.font = `700 13px ${bodyFont}`;
    ctx.fillStyle = mutedText;
    ctx.fillText("VALOR", valorCenterX, cursorY + 32);

    const valorMaxWidth = gridStartX + gridWidth - splitX - 32;
    const { fontSize: valorSize, text: valorFitText } = fitFontSize(
      ctx,
      valorText,
      valorMaxWidth,
      26,
      16,
      "800",
      headingFont,
    );
    ctx.font = `800 ${valorSize}px ${headingFont}`;
    ctx.fillStyle = theme.numberColor;
    ctx.fillText(valorFitText, valorCenterX, cursorY + HERO_TOP_HEIGHT - 26);
  } else {
    // No prize set: valor is the only fact, so it gets the spotlight instead
    // of sitting small in a corner.
    const centerX = gridStartX + gridWidth / 2;
    ctx.textAlign = "center";
    ctx.font = `700 15px ${bodyFont}`;
    ctx.fillStyle = mutedText;
    ctx.fillText("VALOR DEL NÚMERO", centerX, cursorY + 36);

    const maxWidth = gridWidth - 80;
    const { fontSize, text } = fitFontSize(ctx, valorText, maxWidth, 40, 26, "800", headingFont);
    ctx.font = `800 ${fontSize}px ${headingFont}`;
    ctx.fillStyle = theme.numberColor;
    ctx.fillText(text, centerX, cursorY + HERO_TOP_HEIGHT - 30);
  }

  if (hasMeta) {
    const metaY = cursorY + HERO_TOP_HEIGHT;
    ctx.strokeStyle = withAlpha(dark ? "#ffffff" : "#000000", 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gridStartX + 24, metaY);
    ctx.lineTo(gridStartX + gridWidth - 24, metaY);
    ctx.stroke();

    const metaText = raffle.drawDate
      ? `Sorteo el ${formatDate(raffle.drawDate)}${raffle.lottery ? ` · ${raffle.lottery}` : ""}`
      : `Lotería: ${raffle.lottery}`;
    const metaIconSize = 20;
    const metaIconGap = 8;
    ctx.font = `600 18px ${bodyFont}`;
    const metaTextWidth = ctx.measureText(metaText).width;
    const metaBlockWidth = metaIconSize + metaIconGap + metaTextWidth;
    const metaBlockStartX = gridStartX + gridWidth / 2 - metaBlockWidth / 2;
    const metaCenterY = metaY + HERO_META_HEIGHT / 2;

    if (raffle.drawDate) {
      drawCalendarIcon(ctx, metaBlockStartX + metaIconSize / 2, metaCenterY, metaIconSize, theme.numberColor);
    } else {
      drawDiceIcon(ctx, metaBlockStartX + metaIconSize / 2, metaCenterY, metaIconSize, theme.numberColor);
    }
    ctx.textAlign = "left";
    ctx.fillStyle = mutedText;
    ctx.fillText(metaText, metaBlockStartX + metaIconSize + metaIconGap, metaCenterY + 6);
  }

  cursorY += heroHeight;

  // Payment accounts: compact pill chips, wrapped at a fixed count per row so
  // the reserved height only ever depends on how many accounts there are —
  // omitted entirely (no gap reserved) when the raffle has none.
  if (accountsRows > 0) {
    cursorY += ACCOUNTS_GAP;
    const chipGap = 10;
    const chipWidth = (gridWidth - chipGap * (ACCOUNTS_PER_ROW - 1)) / ACCOUNTS_PER_ROW;

    raffle.accounts.forEach((account, index) => {
      const row = Math.floor(index / ACCOUNTS_PER_ROW);
      const indexInRow = index % ACCOUNTS_PER_ROW;
      const itemsInRow = Math.min(ACCOUNTS_PER_ROW, accountsCount - row * ACCOUNTS_PER_ROW);
      const rowWidth = itemsInRow * chipWidth + (itemsInRow - 1) * chipGap;
      const rowStartX = gridStartX + (gridWidth - rowWidth) / 2;
      const x = rowStartX + indexInRow * (chipWidth + chipGap);
      const y = cursorY + row * (ACCOUNT_CHIP_HEIGHT + ACCOUNT_ROW_GAP);

      drawRoundedRect(ctx, x, y, chipWidth, ACCOUNT_CHIP_HEIGHT, ACCOUNT_CHIP_HEIGHT / 2);
      const chipFill = ctx.createLinearGradient(x, y, x, y + ACCOUNT_CHIP_HEIGHT);
      chipFill.addColorStop(0, withAlpha(theme.numberColor, dark ? 0.2 : 0.14));
      chipFill.addColorStop(1, withAlpha(theme.numberColor, dark ? 0.1 : 0.07));
      ctx.fillStyle = chipFill;
      ctx.fill();
      ctx.strokeStyle = withAlpha(theme.numberColor, 0.45);
      ctx.lineWidth = 1.3;
      drawRoundedRect(ctx, x, y, chipWidth, ACCOUNT_CHIP_HEIGHT, ACCOUNT_CHIP_HEIGHT / 2);
      ctx.stroke();

      const iconCx = x + 22;
      const iconCy = y + ACCOUNT_CHIP_HEIGHT / 2;
      drawWalletIcon(ctx, iconCx, iconCy, 18, theme.numberColor);

      const label = account.holderName
        ? `${account.label} ${account.number} · Responsable: ${account.holderName}`
        : `${account.label} ${account.number}`;
      const textStartX = x + 40;
      const textAreaWidth = chipWidth - 40 - 14;
      const { fontSize, text } = fitFontSize(ctx, label, textAreaWidth, 17, 12, "600", bodyFont);
      ctx.font = `600 ${fontSize}px ${bodyFont}`;
      ctx.fillStyle = dark ? "#f5f3ff" : "#131218";
      ctx.textAlign = "left";
      ctx.fillText(text, textStartX, iconCy + fontSize * 0.32);
    });

    cursorY += accountsHeight;
  }

  cursorY += DIVIDER_GAP;

  // Divider: a tapered brush-stroke bar instead of a uniform ruled line.
  const dividerGradient = ctx.createLinearGradient(gridStartX, 0, gridStartX + gridWidth, 0);
  dividerGradient.addColorStop(0, withAlpha(theme.numberColor, 0));
  dividerGradient.addColorStop(0.5, withAlpha(theme.numberColor, 0.45));
  dividerGradient.addColorStop(1, withAlpha(theme.numberColor, 0));
  ctx.fillStyle = dividerGradient;
  ctx.fillRect(gridStartX, cursorY - 1, gridWidth, 2);

  // Legend: small tile-style swatches (same gloss/bevel treatment as the
  // real grid) so the key visually matches what it's explaining.
  const legendY = cursorY + LEGEND_HEIGHT / 2 + 8;
  const swatch = 22;
  const legendAvailable = buildAvailableTileSprite(swatch, swatch * 0.32, theme.numberColor);
  const legendSold = buildSoldTileSprite(swatch, swatch * 0.32, soldTileFill, soldTileBorder);
  ctx.font = `600 22px ${bodyFont}`;
  ctx.textAlign = "left";
  let legendX = gridStartX;
  ctx.drawImage(legendAvailable, legendX, legendY - swatch + 2);
  legendX += swatch + 10;
  ctx.fillStyle = mutedText;
  ctx.fillText("Disponible", legendX, legendY);
  legendX += ctx.measureText("Disponible").width + 32;

  ctx.drawImage(legendSold, legendX, legendY - swatch + 2);
  legendX += swatch + 10;
  ctx.fillStyle = mutedText;
  ctx.fillText("Vendido / apartado", legendX, legendY);

  cursorY += LEGEND_HEIGHT + GRID_TOP_GAP;

  // Grid. Tile looks are prebuilt once (see buildAvailableTileSprite/
  // buildSoldTileSprite) and stamped per cell — real depth for up to 1000
  // tiles without redoing gradient work on every one of them.
  const tileRadius = cellSize * 0.28;
  const numberFontSize = Math.max(13, Math.min(34, cellSize * 0.38));
  const availableSprite = buildAvailableTileSprite(cellSize, tileRadius, theme.numberColor);
  const soldSprite = buildSoldTileSprite(cellSize, tileRadius, soldTileFill, soldTileBorder);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  sorted.forEach((number, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = gridStartX + col * (cellSize + GRID_GAP);
    const y = cursorY + row * (cellSize + GRID_GAP);
    const cx = x + cellSize / 2;
    const cy = y + cellSize / 2;

    if (number.status === "available") {
      ctx.save();
      ctx.shadowColor = withAlpha(theme.numberColor, dark ? 0.5 : 0.32);
      ctx.shadowBlur = cellSize * 0.22;
      ctx.shadowOffsetY = cellSize * 0.06;
      ctx.drawImage(availableSprite, x, y);
      ctx.restore();

      ctx.fillStyle = theme.textColor || DEFAULT_THEME.textColor;
      ctx.font = `800 ${numberFontSize}px ${headingFont}`;
      ctx.fillText(formatNumberValue(number.value), cx, cy + numberFontSize * 0.03);
    } else {
      // Occupied/paid: dimmed tile + a clear diagonal cross so "still
      // available" reads at a glance, which is the whole point of the image.
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = cellSize * 0.12;
      ctx.shadowOffsetY = cellSize * 0.04;
      ctx.drawImage(soldSprite, x, y);
      ctx.restore();

      ctx.fillStyle = mutedText;
      ctx.font = `700 ${numberFontSize}px ${headingFont}`;
      ctx.fillText(formatNumberValue(number.value), cx, cy + numberFontSize * 0.03);

      const inset = cellSize * 0.16;
      ctx.strokeStyle = soldMark;
      ctx.lineWidth = Math.max(2.5, cellSize * 0.06);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + inset, y + inset);
      ctx.lineTo(x + cellSize - inset, y + cellSize - inset);
      ctx.moveTo(x + cellSize - inset, y + inset);
      ctx.lineTo(x + inset, y + cellSize - inset);
      ctx.stroke();
    }
  });

  cursorY += gridHeight + GRID_BOTTOM_GAP;

  // Footer: a small decorative rule + crown bookending the header's, then
  // the brand mark with a soft glow — closing the poster instead of just
  // stopping after the grid.
  const ruleY = cursorY + 14;
  const ruleHalfWidth = 70;
  const ruleGradientLeft = ctx.createLinearGradient(CANVAS_WIDTH / 2 - ruleHalfWidth - 40, 0, CANVAS_WIDTH / 2 - ruleHalfWidth, 0);
  ruleGradientLeft.addColorStop(0, withAlpha(theme.numberColor, 0));
  ruleGradientLeft.addColorStop(1, withAlpha(theme.numberColor, 0.5));
  ctx.fillStyle = ruleGradientLeft;
  ctx.fillRect(CANVAS_WIDTH / 2 - ruleHalfWidth - 40, ruleY, 40, 1.5);
  const ruleGradientRight = ctx.createLinearGradient(CANVAS_WIDTH / 2 + ruleHalfWidth, 0, CANVAS_WIDTH / 2 + ruleHalfWidth + 40, 0);
  ruleGradientRight.addColorStop(0, withAlpha(theme.numberColor, 0.5));
  ruleGradientRight.addColorStop(1, withAlpha(theme.numberColor, 0));
  ctx.fillStyle = ruleGradientRight;
  ctx.fillRect(CANVAS_WIDTH / 2 + ruleHalfWidth, ruleY, 40, 1.5);
  drawCrown(ctx, CANVAS_WIDTH / 2, ruleY - 11, 24, theme.numberColor, 0, 0.9);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 26px ${headingFont}`;
  ctx.fillStyle = theme.numberColor;
  ctx.shadowColor = withAlpha(theme.numberColor, dark ? 0.45 : 0.2);
  ctx.shadowBlur = 14;
  ctx.fillText("Ibirifas", CANVAS_WIDTH / 2, cursorY + 62);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo generar la imagen."));
    }, "image/png");
  });
}

/** Triggers a browser download of the given blob via a temporary `<a download>` link. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
