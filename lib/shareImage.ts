import { darken, lighten, luminance, withAlpha } from "@/lib/color";
import { formatCurrency, formatDrawDate, formatNumberValue, formatDrawTime, formatDrawWhen } from "@/lib/format";
import { drawPlanFromNumbers } from "@/lib/drawPlan";
import { currentStage, installmentPrices, paidStages, sortedStages, stagesPrizeSummary, totalPrice } from "@/lib/stages";
import { DEFAULT_THEME, resolvedTheme } from "@/lib/theme";
import { extraPrizesLine } from "@/lib/prizes";
import { combosLine } from "@/lib/combos";
import type { RaffleDTO, RaffleNumberDTO } from "@/lib/types";

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

const LADDER_HEAD = 92;
const LADDER_ROW = 108;
const LADDER_ROW_GAP = 12;
const LADDER_FOOT = 78;
const LADDER_PAD = 20;

function stagesLadderHeight(count: number): number {
  return LADDER_HEAD + count * LADDER_ROW + Math.max(0, count - 1) * LADDER_ROW_GAP + LADDER_FOOT;
}

/**
 * The hero of a raffle by stages: "1 NÚMERO · 3 SORTEOS", one row per draw (badge, name, date and lottery, prize and
 * its installment) with the final draw highlighted and the next one marked, and the price rule at the bottom.
 */
function drawStagesLadder(
  ctx: CanvasRenderingContext2D,
  raffle: RaffleDTO,
  o: { x: number; y: number; width: number; dark: boolean; color: string; mutedText: string; headingFont: string; bodyFont: string },
): void {
  const stages = sortedStages(raffle.stages);
  const paid = paidStages(stages);
  const finalPos = paid.at(-1)?.position;
  const now = raffle.status === "closed" ? null : currentStage(stages);
  const strong = o.dark ? "#f5f3ff" : "#131218";
  const centerX = o.x + o.width / 2;

  ctx.textAlign = "center";
  ctx.font = `800 24px ${o.headingFont}`;
  ctx.fillStyle = o.color;
  ctx.fillText(`1 NÚMERO · ${paid.length} ${paid.length === 1 ? "SORTEO" : "SORTEOS"}`, centerX, o.y + 44);
  ctx.font = `500 20px ${o.bodyFont}`;
  ctx.fillStyle = o.mutedText;
  ctx.fillText("Pagas por etapas y juegas con el mismo número en cada sorteo", centerX, o.y + 74);

  const rowX = o.x + LADDER_PAD;
  const rowW = o.width - LADDER_PAD * 2;
  stages.forEach((st, i) => {
    const top = o.y + LADDER_HEAD + i * (LADDER_ROW + LADDER_ROW_GAP);
    const cy = top + LADDER_ROW / 2;
    const isFinal = st.position === finalPos;
    const isNow = now?.position === st.position;
    ctx.save();
    if (st.outcome) ctx.globalAlpha = 0.6;

    drawRoundedRect(ctx, rowX, top, rowW, LADDER_ROW, 20);
    if (isFinal) {
      ctx.shadowColor = withAlpha(o.color, o.dark ? 0.45 : 0.25);
      ctx.shadowBlur = 24;
    }
    ctx.fillStyle = isFinal ? withAlpha(o.color, o.dark ? 0.2 : 0.12) : o.dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.strokeStyle = withAlpha(o.color, isFinal ? 0.7 : 0.22);
    ctx.lineWidth = isFinal ? 2.5 : 1.5;
    drawRoundedRect(ctx, rowX, top, rowW, LADDER_ROW, 20);
    ctx.stroke();

    // Badge: the step number, a crown for the final draw, a star for the bonus draw.
    const bx = rowX + 52;
    ctx.beginPath();
    ctx.arc(bx, cy, 30, 0, Math.PI * 2);
    if (isFinal) {
      ctx.fillStyle = o.color;
      ctx.fill();
      drawCrown(ctx, bx, cy - 11, 34, luminance(o.color) > 0.55 ? "#131218" : "#ffffff");
    } else {
      ctx.strokeStyle = withAlpha(o.color, 0.7);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = o.color;
      ctx.textAlign = "center";
      ctx.font = `800 28px ${o.headingFont}`;
      ctx.fillText(st.bonus ? "★" : String(paid.findIndex((p) => p.position === st.position) + 1), bx, cy + 10);
    }

    // Right: the prize (bigger for the final draw) and what that step costs.
    const rightX = rowX + rowW - 26;
    const prizeMax = rowW * 0.42;
    const prize = fitFontSize(ctx, st.prize, prizeMax, isFinal ? 52 : 38, 22, "800", o.headingFont);
    ctx.textAlign = "right";
    ctx.font = `800 ${prize.fontSize}px ${o.headingFont}`;
    ctx.fillStyle = o.color;
    ctx.fillText(prize.text, rightX, cy + (isFinal ? 8 : 4));
    const prizeWidth = ctx.measureText(prize.text).width;
    ctx.font = `600 19px ${o.bodyFont}`;
    ctx.fillStyle = o.mutedText;
    ctx.fillText(st.bonus ? "pagando todo de una" : `cuota ${formatCurrency(st.price)}`, rightX, cy + 38);

    // Left: name (+ "SE JUEGA AHORA") and date · lottery, or the result once played.
    const textX = bx + 50;
    const textMax = rightX - Math.max(prizeWidth, 160) - 28 - textX;
    const label = fitFontSize(ctx, st.label, Math.max(120, textMax - (isNow ? 170 : 0)), 30, 20, "800", o.headingFont);
    ctx.textAlign = "left";
    ctx.font = `800 ${label.fontSize}px ${o.headingFont}`;
    ctx.fillStyle = strong;
    ctx.fillText(label.text, textX, cy - 6);
    if (isNow) {
      const chipX = textX + ctx.measureText(label.text).width + 12;
      ctx.font = `800 15px ${o.headingFont}`;
      const chipText = "SE JUEGA AHORA";
      const chipW = ctx.measureText(chipText).width + 20;
      drawRoundedRect(ctx, chipX, cy - 30, chipW, 28, 14);
      ctx.fillStyle = withAlpha(o.color, o.dark ? 0.24 : 0.16);
      ctx.fill();
      ctx.fillStyle = o.color;
      ctx.fillText(chipText, chipX + 10, cy - 11);
    }
    const lottery = st.lottery || raffle.lottery;
    const meta =
      st.winnerValue !== null
        ? `${st.outcome === "won" ? "Ganó el" : "Salió el"} ${formatNumberValue(st.winnerValue)}${st.outcome === "house" ? " · quedó en la casa" : ""}`
        : `${st.drawDate ? formatDrawDate(st.drawDate) : "Fecha por definir"}${st.drawDate && raffle.drawTime ? ` · ${formatDrawTime(raffle.drawTime)}` : ""}${lottery ? ` · ${lottery}` : ""}`;
    const metaFit = fitFontSize(ctx, meta, Math.max(120, textMax), 21, 15, "600", o.bodyFont);
    ctx.font = `600 ${metaFit.fontSize}px ${o.bodyFont}`;
    ctx.fillStyle = o.mutedText;
    ctx.fillText(metaFit.text, textX, cy + 28);
    ctx.restore();
  });

  // Price rule.
  const footTop = o.y + LADDER_HEAD + stages.length * LADDER_ROW + Math.max(0, stages.length - 1) * LADDER_ROW_GAP + 16;
  ctx.strokeStyle = withAlpha(o.dark ? "#ffffff" : "#000000", 0.12);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(o.x + 24, footTop);
  ctx.lineTo(o.x + o.width - 24, footTop);
  ctx.stroke();
  const prices = installmentPrices(stages);
  const total = totalPrice(stages);
  const bonus = stages.find((st) => st.bonus);
  const quotas = new Set(prices).size === 1 ? `${prices.length} cuotas de ${formatCurrency(prices[0]!)}` : `Cuotas ${prices.map(formatCurrency).join(" + ")}`;
  const full =
    raffle.fullPayPerk === "discount" && raffle.fullPayDiscount
      ? `Todo de una ${formatCurrency(total - raffle.fullPayDiscount)} (antes ${formatCurrency(total)})`
      : raffle.fullPayPerk === "draw" && bonus
        ? `Todo de una ${formatCurrency(total)} + ${bonus.label}`
        : `Todo de una ${formatCurrency(total)}`;
  const footText = `${quotas}  ·  ${full}`;
  const footFit = fitFontSize(ctx, footText, o.width - 48, 25, 16, "700", o.headingFont);
  ctx.textAlign = "center";
  ctx.font = `700 ${footFit.fontSize}px ${o.headingFont}`;
  ctx.fillStyle = strong;
  ctx.fillText(footFit.text, centerX, footTop + 40);
}

export async function generateRaffleShareImage(raffle: RaffleDTO): Promise<Blob> {
  await ensureFontsReady();

  const theme = resolvedTheme(raffle);
  const total = raffle.numbers.length || raffle.totalNumbers;
  const sorted = [...raffle.numbers].sort((a, b) => a.value - b.value);

  const headingFont = getBrandFontFamily("--font-heading", FALLBACK_HEADING_FONT);
  const bodyFont = getBrandFontFamily("--font-body", FALLBACK_BODY_FONT);

  // Raffles sold in lettered sets draw one block per letter (header + its
  // numbers), then the loose numbers; a plain raffle is a single headerless block.
  const hasSets = raffle.groups.length > 0;
  const columns = hasSets ? 10 : pickColumns(total);
  interface Section {
    set: { label: string; price: number; sold: boolean } | null;
    title: string | null;
    numbers: RaffleNumberDTO[];
  }
  const sections: Section[] = [];
  if (hasSets) {
    // By letters the poster shows only what can still be bought: sold sets and taken loose
    // numbers are left out (a plain raffle keeps showing everything, sold ones muted).
    for (const group of raffle.groups) {
      const members = sorted.filter((n) => n.groupId === group.id);
      if (members.length === 0 || members.some((n) => n.status !== "available")) continue;
      sections.push({
        set: { label: group.label, price: group.price, sold: members.every((n) => n.status !== "available") },
        title: null,
        numbers: members,
      });
    }
    const loose = sorted.filter((n) => n.groupId === null && n.status === "available");
    if (loose.length > 0) {
      sections.push({ set: null, title: `NÚMEROS SUELTOS · ${formatCurrency(raffle.numberPrice)} C/U`, numbers: loose });
    }
    if (sections.length === 0) sections.push({ set: null, title: "YA NO QUEDAN DISPONIBLES", numbers: [] });
  } else {
    sections.push({ set: null, title: null, numbers: sorted });
  }
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
  const TITLE_MAX_SIZE = 88;
  const TITLE_MIN_SIZE = 40;
  const TITLE_MAX_LINES = 2;
  const TITLE_LINE_HEIGHT = 1.1;
  const UNDERLINE_GAP = 14;
  const UNDERLINE_HEIGHT = 8;
  const KICKER_GAP = 20;
  const KICKER_HEIGHT = 46;
  const HERO_GAP = 26;
  const HERO_TOP_HEIGHT = 178;
  const HERO_META_HEIGHT = 62;
  const ACCOUNTS_GAP = 18;
  const ACCOUNTS_HEADER_HEIGHT = 50;
  const ACCOUNT_ROW_HEIGHT = 52;
  const ACCOUNTS_BOTTOM_PADDING = 12;
  const DIVIDER_GAP = 26;
  const LEGEND_HEIGHT = 32;
  const GRID_TOP_GAP = 30;
  const GRID_BOTTOM_GAP = 46;
  const FOOTER_HEIGHT = 92;
  // The raffle's permit, when the organizer gave one, closes the poster under the brand mark.
  const permitText = raffle.permit?.trim() ? `Permiso: ${raffle.permit.trim()}` : null;
  const PERMIT_HEIGHT = permitText ? 44 : 0;

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
  const prizeText = raffle.prizeLabel || stagesPrizeSummary(raffle.stages);
  const hasPrize = Boolean(prizeText);
  // A raffle by stages announces its next draw (prize and date) instead of the last one.
  const nextStage = raffle.stages.length > 0 ? currentStage(raffle.stages) : null;
  const basePlan = drawPlanFromNumbers(raffle);
  const drawPlan = nextStage
    ? {
        ...basePlan,
        line: `${nextStage.label}: ${nextStage.prize}${nextStage.drawDate ? ` · ${formatDrawWhen(nextStage.drawDate, raffle.drawTime)}` : ""}`,
      }
    : basePlan;
  const lottery = nextStage?.lottery || raffle.lottery;
  const hasMeta = Boolean(drawPlan.line || lottery);
  // A raffle by stages shows its draws as a ladder instead of one big prize next to the total price
  // (which read as "7 millones por 150 mil").
  const byStages = raffle.stages.length > 0;
  const ladderHeight = byStages ? stagesLadderHeight(raffle.stages.length) : 0;
  // "Gana Más": one more line in the hero with the extra prizes.
  // Combos (lib/combos.ts): their own line too, so "2 por $4.000" is seen next to the number price.
  const extraLines = [
    ...(!byStages && raffle.extraPrizes.length > 0 ? [`Gana Más: ${extraPrizesLine(raffle.extraPrizes, raffle.totalNumbers)}`] : []),
    ...(!byStages && raffle.combos.length > 0 ? [`Combos: ${combosLine(raffle.combos)}`] : []),
  ];
  const EXTRA_LINE_HEIGHT = 62;
  const HERO_EXTRA_HEIGHT = extraLines.length * EXTRA_LINE_HEIGHT;
  const heroHeight = byStages ? ladderHeight : HERO_TOP_HEIGHT + (hasMeta ? HERO_META_HEIGHT : 0) + HERO_EXTRA_HEIGHT;

  const accountsCount = raffle.accounts.length;
  const accountsHeight =
    accountsCount > 0 ? ACCOUNTS_HEADER_HEIGHT + accountsCount * ACCOUNT_ROW_HEIGHT + ACCOUNTS_BOTTOM_PADDING : 0;

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
    (accountsCount > 0 ? ACCOUNTS_GAP + accountsHeight : 0) +
    DIVIDER_GAP +
    LEGEND_HEIGHT;

  const SECTION_HEAD_HEIGHT = 74;
  const SECTION_GAP = 38;
  const sectionHeights = sections.map((section) => {
    const sectionRows = Math.max(1, Math.ceil(section.numbers.length / columns));
    const head = section.set || section.title ? SECTION_HEAD_HEIGHT : 0;
    return head + sectionRows * cellSize + (sectionRows - 1) * GRID_GAP;
  });
  const gridHeight = sectionHeights.reduce((sum, h) => sum + h, 0) + (sections.length - 1) * SECTION_GAP;
  const canvasHeight = headerHeight + GRID_TOP_GAP + gridHeight + GRID_BOTTOM_GAP + FOOTER_HEIGHT + PERMIT_HEIGHT;

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

  const setPrices = raffle.groups.map((g) => g.price);
  const quotaCount = raffle.stages.filter((st) => !st.bonus).length;
  const valorLabel = hasSets ? "VALOR DEL CONJUNTO" : quotaCount > 0 ? `VALOR · ${quotaCount} CUOTAS` : "VALOR DEL NÚMERO";
  const valorText = hasSets
    ? Math.min(...setPrices) === Math.max(...setPrices)
      ? formatCurrency(setPrices[0]!)
      : `${formatCurrency(Math.min(...setPrices))} – ${formatCurrency(Math.max(...setPrices))}`
    : formatCurrency(raffle.numberPrice);

  if (byStages) {
    drawStagesLadder(ctx, raffle, { x: gridStartX, y: cursorY, width: gridWidth, dark, color: theme.numberColor, mutedText, headingFont, bodyFont });
  } else {
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

      // Both values share one baseline so the two columns read as a single row.
      const labelBaseline = cursorY + 44;
      const valueBaseline = cursorY + HERO_TOP_HEIGHT - 34;

      ctx.textAlign = "center";
      ctx.font = `800 22px ${headingFont}`;
      ctx.fillStyle = mutedText;
      ctx.fillText("PREMIO", premioCenterX, labelBaseline);

      // Short prizes ("$500.000") stay on one big line; long ones ("Moto AKT
      // 125 + casco") wrap to two lines rather than shrinking below the valor.
      // The 48px two-line cap keeps the first line clear of the label.
      const premioMaxWidth = splitX - gridStartX - 40;
      let premioSize = 0;
      let premioLines: string[] = [];
      for (let size = 96; size >= 56; size -= 2) {
        ctx.font = `800 ${size}px ${headingFont}`;
        if (ctx.measureText(prizeText!).width <= premioMaxWidth) {
          premioSize = size;
          premioLines = [prizeText!];
          break;
        }
      }
      if (premioLines.length === 0) {
        const wrapped = fitHeadline(ctx, prizeText!, premioMaxWidth, 2, 48, 30, "800", headingFont);
        premioSize = wrapped.fontSize;
        premioLines = wrapped.lines;
      }
      const premioLineHeight = premioSize * 1.05;
      ctx.font = `800 ${premioSize}px ${headingFont}`;
      ctx.fillStyle = theme.numberColor;
      ctx.shadowColor = withAlpha(theme.numberColor, dark ? 0.5 : 0.25);
      ctx.shadowBlur = premioSize * 0.3;
      premioLines.forEach((line, i) => {
        const y = valueBaseline - (premioLines.length - 1 - i) * premioLineHeight;
        ctx.fillText(line, premioCenterX, y);
      });
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      ctx.font = `800 20px ${headingFont}`;
      ctx.fillStyle = mutedText;
      ctx.fillText(valorLabel, valorCenterX, labelBaseline);

      // Valor always stays visibly smaller than premio.
      const valorMaxWidth = gridStartX + gridWidth - splitX - 32;
      const { fontSize: valorSize, text: valorFitText } = fitFontSize(
        ctx,
        valorText,
        valorMaxWidth,
        Math.max(24, Math.min(58, Math.round(premioSize * 0.72))),
        24,
        "800",
        headingFont,
      );
      ctx.font = `800 ${valorSize}px ${headingFont}`;
      ctx.fillStyle = theme.numberColor;
      ctx.fillText(valorFitText, valorCenterX, valueBaseline);
    } else {
      // No prize set: valor is the only fact, so it gets the spotlight instead
      // of sitting small in a corner.
      const centerX = gridStartX + gridWidth / 2;
      ctx.textAlign = "center";
      ctx.font = `800 22px ${headingFont}`;
      ctx.fillStyle = mutedText;
      ctx.fillText(valorLabel, centerX, cursorY + 44);

      const maxWidth = gridWidth - 80;
      const { fontSize, text } = fitFontSize(ctx, valorText, maxWidth, 88, 32, "800", headingFont);
      ctx.font = `800 ${fontSize}px ${headingFont}`;
      ctx.fillStyle = theme.numberColor;
      ctx.shadowColor = withAlpha(theme.numberColor, dark ? 0.5 : 0.25);
      ctx.shadowBlur = fontSize * 0.3;
      ctx.fillText(text, centerX, cursorY + HERO_TOP_HEIGHT - 34);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    if (hasMeta) {
      const metaY = cursorY + HERO_TOP_HEIGHT;
      ctx.strokeStyle = withAlpha(dark ? "#ffffff" : "#000000", 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gridStartX + 24, metaY);
      ctx.lineTo(gridStartX + gridWidth - 24, metaY);
      ctx.stroke();

      const metaText = drawPlan.line
        ? `${drawPlan.line}${lottery ? ` · ${lottery}` : ""}`
        : `Lotería: ${lottery}`;
      const metaIconSize = 26;
      const metaIconGap = 10;
      ctx.font = `600 24px ${bodyFont}`;
      const metaTextWidth = ctx.measureText(metaText).width;
      const metaBlockWidth = metaIconSize + metaIconGap + metaTextWidth;
      const metaBlockStartX = gridStartX + gridWidth / 2 - metaBlockWidth / 2;
      const metaCenterY = metaY + HERO_META_HEIGHT / 2;

      if (drawPlan.line) {
        drawCalendarIcon(ctx, metaBlockStartX + metaIconSize / 2, metaCenterY, metaIconSize, theme.numberColor);
      } else {
        drawDiceIcon(ctx, metaBlockStartX + metaIconSize / 2, metaCenterY, metaIconSize, theme.numberColor);
      }
      ctx.textAlign = "left";
      ctx.fillStyle = mutedText;
      ctx.fillText(metaText, metaBlockStartX + metaIconSize + metaIconGap, metaCenterY + 8);
    }
    for (const [i, extraText] of extraLines.entries()) {
      const extraY = cursorY + HERO_TOP_HEIGHT + (hasMeta ? HERO_META_HEIGHT : 0) + i * EXTRA_LINE_HEIGHT;
      ctx.strokeStyle = withAlpha(dark ? "#ffffff" : "#000000", 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gridStartX + 24, extraY);
      ctx.lineTo(gridStartX + gridWidth - 24, extraY);
      ctx.stroke();
      const fit = fitFontSize(ctx, extraText, gridWidth - 48, 26, 17, "700", bodyFont);
      ctx.font = `700 ${fit.fontSize}px ${bodyFont}`;
      ctx.textAlign = "center";
      ctx.fillStyle = theme.numberColor;
      ctx.fillText(fit.text, gridStartX + gridWidth / 2, extraY + EXTRA_LINE_HEIGHT / 2 + 9);
    }
  }

  cursorY += heroHeight;

  // Payment accounts: a card styled like the hero banner, one centered row
  // per account (gold bank name, bright number, muted responsable). Rows are
  // sized to their content, so a single short account never leaves a
  // half-empty pill behind it.
  if (accountsCount > 0) {
    cursorY += ACCOUNTS_GAP;

    drawRoundedRect(ctx, gridStartX, cursorY, gridWidth, accountsHeight, 24);
    ctx.fillStyle = dark ? withAlpha("#000000", 0.32) : withAlpha("#ffffff", 0.55);
    ctx.fill();
    ctx.strokeStyle = withAlpha(theme.numberColor, 0.4);
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, gridStartX, cursorY, gridWidth, accountsHeight, 24);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.font = `800 20px ${headingFont}`;
    ctx.fillStyle = mutedText;
    ctx.fillText("CUENTAS DE PAGO", CANVAS_WIDTH / 2, cursorY + 36);

    const rowMaxWidth = gridWidth - 48;
    const numberColor = dark ? "#f5f3ff" : "#131218";

    raffle.accounts.forEach((account, index) => {
      const rowTop = cursorY + ACCOUNTS_HEADER_HEIGHT + index * ACCOUNT_ROW_HEIGHT;
      const rowCy = rowTop + ACCOUNT_ROW_HEIGHT / 2;

      if (index > 0) {
        ctx.strokeStyle = withAlpha(dark ? "#ffffff" : "#000000", 0.08);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gridStartX + 40, rowTop);
        ctx.lineTo(gridStartX + gridWidth - 40, rowTop);
        ctx.stroke();
      }

      // 10-digit Colombian mobile numbers (Nequi/Daviplata) read far easier
      // grouped 3-3-4; anything else is shown exactly as entered.
      const number = /^\d{10}$/.test(account.number)
        ? `${account.number.slice(0, 3)} ${account.number.slice(3, 6)} ${account.number.slice(6)}`
        : account.number;
      let holder = account.holderName ? `· ${account.kind === "breb" ? "Titular" : "Responsable"}: ${account.holderName}` : null;
      // A Bre-B llave says so, unless the organizer already named it that way.
      const accountLabel = account.kind === "breb" && !/bre-?b/i.test(account.label) ? `${account.label} Bre-B` : account.label;

      const measure = (scale: number) => {
        ctx.font = `800 ${26 * scale}px ${headingFont}`;
        const labelWidth = ctx.measureText(accountLabel).width;
        ctx.font = `700 ${26 * scale}px ${bodyFont}`;
        const numberWidth = ctx.measureText(number).width;
        ctx.font = `600 ${20 * scale}px ${bodyFont}`;
        const holderWidth = holder ? ctx.measureText(holder).width : 0;
        const gap = 12 * scale;
        const icon = 24 * scale;
        const total = icon + gap + labelWidth + gap + numberWidth + (holder ? gap + holderWidth : 0);
        return { labelWidth, numberWidth, gap, icon, total };
      };

      // Shrink the whole row first; only if it still overflows, shorten the
      // responsable (the least essential part), then drop it.
      let scale = 1;
      let m = measure(scale);
      while (m.total > rowMaxWidth && scale > 0.6) {
        scale -= 0.05;
        m = measure(scale);
      }
      while (holder && m.total > rowMaxWidth) {
        const base = holder.endsWith("…") ? holder.slice(0, -1) : holder;
        holder = base.length > 16 ? `${base.slice(0, -1)}…` : null;
        m = measure(scale);
      }

      let x = CANVAS_WIDTH / 2 - m.total / 2;
      drawWalletIcon(ctx, x + m.icon / 2, rowCy, m.icon, theme.numberColor);
      x += m.icon + m.gap;

      ctx.textAlign = "left";
      ctx.font = `800 ${26 * scale}px ${headingFont}`;
      ctx.fillStyle = theme.numberColor;
      ctx.fillText(accountLabel, x, rowCy + 9 * scale);
      x += m.labelWidth + m.gap;

      ctx.font = `700 ${26 * scale}px ${bodyFont}`;
      ctx.fillStyle = numberColor;
      ctx.fillText(number, x, rowCy + 9 * scale);
      x += m.numberWidth + m.gap;

      if (holder) {
        ctx.font = `600 ${20 * scale}px ${bodyFont}`;
        ctx.fillStyle = mutedText;
        ctx.fillText(holder, x, rowCy + 7 * scale);
      }
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

  // By letters only what is free is drawn, so there is nothing sold to explain.
  if (!hasSets) {
    ctx.drawImage(legendSold, legendX, legendY - swatch + 2);
    legendX += swatch + 10;
    ctx.fillStyle = mutedText;
    ctx.fillText("Vendido / apartado", legendX, legendY);
  }

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

  const drawTile = (number: RaffleNumberDTO, x: number, y: number) => {
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
  };

  let sectionY = cursorY;
  sections.forEach((section, sectionIndex) => {
    let tilesTop = sectionY;

    if (section.set || section.title) {
      // Block header: the letter as a tile, its name, and its price — or
      // "VENDIDO" once someone has the whole set.
      const headMid = sectionY + 28;
      ctx.textBaseline = "middle";
      if (section.set) {
        const badge = 56;
        const badgeX = gridStartX;
        const badgeY = sectionY;
        if (section.set.sold) {
          ctx.drawImage(soldSprite, 0, 0, cellSize, cellSize, badgeX, badgeY, badge, badge);
        } else {
          ctx.drawImage(availableSprite, 0, 0, cellSize, cellSize, badgeX, badgeY, badge, badge);
        }
        ctx.textAlign = "center";
        ctx.font = `800 34px ${headingFont}`;
        ctx.fillStyle = section.set.sold ? mutedText : theme.textColor || DEFAULT_THEME.textColor;
        ctx.fillText(section.set.label, badgeX + badge / 2, badgeY + badge / 2 + 1);

        ctx.textAlign = "left";
        ctx.font = `800 30px ${headingFont}`;
        ctx.fillStyle = section.set.sold ? mutedText : theme.numberColor;
        ctx.fillText(`CONJUNTO ${section.set.label}`, badgeX + badge + 18, headMid);

        ctx.textAlign = "right";
        if (section.set.sold) {
          ctx.font = `800 26px ${headingFont}`;
          ctx.fillStyle = mutedText;
          ctx.fillText("VENDIDO", gridStartX + gridWidth, headMid);
        } else {
          ctx.font = `800 40px ${headingFont}`;
          ctx.fillStyle = theme.numberColor;
          ctx.shadowColor = withAlpha(theme.numberColor, dark ? 0.45 : 0.2);
          ctx.shadowBlur = 12;
          ctx.fillText(formatCurrency(section.set.price), gridStartX + gridWidth, headMid);
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
        }
      } else if (section.title) {
        ctx.textAlign = "left";
        ctx.font = `800 26px ${headingFont}`;
        ctx.fillStyle = mutedText;
        ctx.fillText(section.title, gridStartX, headMid);
      }
      // Hairline under the header, then the numbers.
      ctx.fillStyle = withAlpha(theme.numberColor, 0.28);
      ctx.fillRect(gridStartX, sectionY + SECTION_HEAD_HEIGHT - 12, gridWidth, 1.5);
      tilesTop = sectionY + SECTION_HEAD_HEIGHT;
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    section.numbers.forEach((number, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      drawTile(number, gridStartX + col * (cellSize + GRID_GAP), tilesTop + row * (cellSize + GRID_GAP));
    });

    sectionY += sectionHeights[sectionIndex]! + SECTION_GAP;
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

  if (permitText) {
    const permit = fitFontSize(ctx, permitText, CANVAS_WIDTH - SIDE_PADDING * 2, 22, 16, "600", bodyFont);
    ctx.font = `600 ${permit.fontSize}px ${bodyFont}`;
    ctx.fillStyle = mutedText;
    ctx.fillText(permit.text, CANVAS_WIDTH / 2, cursorY + 62 + PERMIT_HEIGHT);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo generar la imagen."));
    }, "image/png");
  });
}

/** Triggers a browser download of the given blob via a temporary `<a download>` link. */
export interface WinnerImageInput {
  raffleName: string;
  themeBackground?: string | null;
  themeNumberColor?: string | null;
  themeTextColor?: string | null;
  winnerValue: number;
  /** Who won; null when nobody did (the prize stays with the organizer). */
  winnerName: string | null;
  /** Why nobody won: nobody had the number, or (by stages) it wasn't up to date with its installments. */
  noWinnerReason?: "nobody" | "notUpToDate";
  prize: string | null;
  /** A raffle by stages: which draw it was. */
  stageLabel?: string | null;
  lottery: string | null;
  drawDate: string | null;
  /** "Gana Más": the extra prizes someone took, listed under the main one. */
  others?: { label: string; value: number; name: string; prize: string | null }[];
}

/** "Ana Pérez Gómez" → "Ana P." — enough to recognize the winner in a public status, without the full name. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0]! : `${parts[0]} ${parts[1]!.charAt(0).toUpperCase()}.`;
}

/**
 * The winner's announcement for a WhatsApp/Instagram status (1080×1920): "¡Tenemos ganador!", the number on a big
 * golden ball, who won and what, and a thank-you to everyone who played. In the raffle's own colors.
 */
export async function generateWinnerImage(input: WinnerImageInput): Promise<Blob> {
  await ensureFontsReady();
  const W = 1080;
  const H = 1920;
  const theme = resolvedTheme(input);
  const headingFont = getBrandFontFamily("--font-heading", FALLBACK_HEADING_FONT);
  const bodyFont = getBrandFontFamily("--font-body", FALLBACK_BODY_FONT);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el lienzo para la imagen.");
  const dark = luminance(theme.background) < 0.5;
  const accent = theme.numberColor;
  const muted = dark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.58)";
  // Plain text sits on the background (the theme's text color is for the number tiles).
  const onBg = dark ? "#ffffff" : "#1b1405";
  const won = input.winnerName !== null;
  const others = input.others ?? [];
  // With extra winners everything above them gets tighter to make room for their rows.
  const compact = others.length > 0;

  drawBackgroundArt(ctx, W, H, theme.background, accent, dark);

  // Confetti around the top (fixed positions, so the same raffle always looks the same).
  const confettiColors = [accent, lighten(accent, 0.35), dark ? "#ffffff" : darken(accent, 0.25)];
  for (let i = 0; i < 46; i++) {
    const x = ((i * 233) % 1000) + 40;
    const y = ((i * 149) % 620) + 30 + (i % 3) * 18;
    if (x > 300 && x < 780 && y > 120 && y < 560) continue; // keep the headline area clear
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((i * 47) % 180) * (Math.PI / 180));
    ctx.globalAlpha = 0.55 + (i % 4) * 0.1;
    ctx.fillStyle = confettiColors[i % confettiColors.length]!;
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, 7 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-11, -4, 22, 8);
    }
    ctx.restore();
  }

  const center = W / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  drawCrown(ctx, center, compact ? 110 : 150, compact ? 120 : 150, accent);

  // Headline
  const winnersCount = (won ? 1 : 0) + others.length;
  const headline =
    winnersCount > 1
      ? "¡TENEMOS GANADORES!"
      : winnersCount === 1
        ? input.stageLabel
          ? `¡GANADOR DE ${input.stageLabel.toUpperCase()}!`
          : "¡TENEMOS GANADOR!"
        : "RESULTADO DEL SORTEO";
  const head = fitFontSize(ctx, headline, W - 120, 100, 54, "800", headingFont);
  ctx.font = `800 ${head.fontSize}px ${headingFont}`;
  ctx.fillStyle = accent;
  ctx.shadowColor = withAlpha(accent, dark ? 0.55 : 0.25);
  ctx.shadowBlur = 30;
  ctx.fillText(head.text, center, compact ? 320 : 380);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  const name = fitFontSize(ctx, input.raffleName, W - 160, 52, 30, "700", headingFont);
  ctx.font = `700 ${name.fontSize}px ${headingFont}`;
  ctx.fillStyle = onBg;
  ctx.fillText(name.text, center, compact ? 395 : 460);

  // The golden ball with the number
  const ballY = compact ? 630 : 800;
  const R = compact ? 175 : 250;
  const halo = ctx.createRadialGradient(center, ballY, R * 0.6, center, ballY, R * 1.55);
  halo.addColorStop(0, withAlpha(accent, dark ? 0.45 : 0.25));
  halo.addColorStop(1, withAlpha(accent, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(center, ballY, R * 1.55, 0, Math.PI * 2);
  ctx.fill();
  const ball = ctx.createRadialGradient(center - R * 0.35, ballY - R * 0.4, R * 0.1, center, ballY, R);
  ball.addColorStop(0, lighten(accent, 0.55));
  ball.addColorStop(0.55, accent);
  ball.addColorStop(1, darken(accent, 0.3));
  ctx.fillStyle = ball;
  ctx.beginPath();
  ctx.arc(center, ballY, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(lighten(accent, 0.6), 0.7);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(center, ballY, R - 18, 0, Math.PI * 2);
  ctx.stroke();
  const onBall = luminance(accent) > 0.5 ? "#2a1d03" : "#ffffff";
  const digits = formatNumberValue(input.winnerValue);
  const ballFont = (digits.length > 3 ? 190 : digits.length > 2 ? 230 : 280) * (R / 250);
  ctx.font = `800 ${ballFont}px ${headingFont}`;
  ctx.fillStyle = onBall;
  ctx.textBaseline = "middle";
  ctx.fillText(digits, center, ballY + 14);
  ctx.textBaseline = "alphabetic";

  // Who won and what
  let y = ballY + R + (compact ? 90 : 120);
  if (won) {
    const who = fitFontSize(ctx, shortName(input.winnerName!), W - 140, compact ? 68 : 84, 40, "800", headingFont);
    ctx.font = `800 ${who.fontSize}px ${headingFont}`;
    ctx.fillStyle = onBg;
    ctx.fillText(who.text, center, y);
    y += compact ? 62 : 78;
    if (input.prize) {
      const prize = fitFontSize(ctx, `se llevó ${input.prize}`, W - 140, 56, 32, "700", headingFont);
      ctx.font = `700 ${prize.fontSize}px ${headingFont}`;
      ctx.fillStyle = accent;
      ctx.fillText(prize.text, center, y);
      y += compact ? 52 : 64;
    }
  } else {
    ctx.font = `800 64px ${headingFont}`;
    ctx.fillStyle = onBg;
    ctx.fillText(input.noWinnerReason === "notUpToDate" ? "No estaba al día" : "Nadie tenía este número", center, y);
    y += 66;
    ctx.font = `600 40px ${bodyFont}`;
    ctx.fillStyle = accent;
    ctx.fillText("El premio queda en la casa", center, y);
    y += 60;
  }
  const when = [input.lottery, input.drawDate ? formatDrawDate(input.drawDate) : null].filter(Boolean).join(" · ");
  if (when) {
    const w = fitFontSize(ctx, when, W - 160, 34, 24, "600", bodyFont);
    ctx.font = `600 ${w.fontSize}px ${bodyFont}`;
    ctx.fillStyle = muted;
    ctx.fillText(w.text, center, y + 6);
    y += 40;
  }

  // The extra winners, one row each: their number on a small ball, which prize, who, and what it pays.
  if (compact) {
    let rowY = y + 30;
    for (const o of others.slice(0, 5)) {
      const left = 80;
      const width = W - 160;
      const h = 100;
      drawRoundedRect(ctx, left, rowY, width, h, 26);
      ctx.fillStyle = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
      ctx.fill();
      ctx.strokeStyle = withAlpha(accent, 0.35);
      ctx.lineWidth = 2;
      ctx.stroke();
      const cx = left + 58;
      const cy = rowY + h / 2;
      const small = ctx.createRadialGradient(cx - 12, cy - 14, 4, cx, cy, 38);
      small.addColorStop(0, lighten(accent, 0.5));
      small.addColorStop(1, darken(accent, 0.2));
      ctx.fillStyle = small;
      ctx.beginPath();
      ctx.arc(cx, cy, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = onBall;
      ctx.font = `800 ${formatNumberValue(o.value).length > 2 ? 26 : 32}px ${headingFont}`;
      ctx.textBaseline = "middle";
      ctx.fillText(formatNumberValue(o.value), cx, cy + 2);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.font = `600 26px ${bodyFont}`;
      ctx.fillStyle = muted;
      ctx.fillText(o.label.toUpperCase(), left + 116, rowY + 40);
      const prizeText = o.prize ?? "";
      ctx.font = `800 34px ${headingFont}`;
      const prizeWidth = prizeText ? Math.min(ctx.measureText(prizeText).width, 300) : 0;
      const nameFit = fitFontSize(ctx, shortName(o.name), width - 116 - prizeWidth - 50, 40, 26, "800", headingFont);
      ctx.font = `800 ${nameFit.fontSize}px ${headingFont}`;
      ctx.fillStyle = onBg;
      ctx.fillText(nameFit.text, left + 116, rowY + 80);
      if (prizeText) {
        const pf = fitFontSize(ctx, prizeText, 300, 34, 22, "800", headingFont);
        ctx.font = `800 ${pf.fontSize}px ${headingFont}`;
        ctx.fillStyle = accent;
        ctx.textAlign = "right";
        ctx.fillText(pf.text, left + width - 28, cy + 12);
      }
      ctx.textAlign = "center";
      rowY += h + 16;
    }
    y = rowY;
  }

  // Thanks
  if (compact) {
    const thanksY = Math.max(y + 90, 1660);
    const t = fitFontSize(ctx, "¡Gracias a todos por participar!", W - 120, 56, 36, "800", headingFont);
    ctx.font = `800 ${t.fontSize}px ${headingFont}`;
    ctx.fillStyle = onBg;
    ctx.fillText(t.text, center, thanksY);
    ctx.font = `600 32px ${bodyFont}`;
    ctx.fillStyle = muted;
    ctx.fillText(winnersCount > 1 ? "¡Felicitaciones a los ganadores!" : "¡Felicitaciones!", center, thanksY + 56);
  } else {
    const thanksY = 1580;
    ctx.fillStyle = withAlpha(accent, 0.45);
    ctx.fillRect(center - 160, thanksY - 110, 320, 3);
    ctx.font = `800 62px ${headingFont}`;
    ctx.fillStyle = onBg;
    ctx.fillText("¡Gracias a todos", center, thanksY - 20);
    ctx.fillText("por participar!", center, thanksY + 54);
    ctx.font = `600 36px ${bodyFont}`;
    ctx.fillStyle = muted;
    ctx.fillText(won ? "¡Felicitaciones al ganador!" : "Nos vemos en la próxima rifa.", center, thanksY + 124);
  }

  // Brand
  drawCrown(ctx, center, H - 150, 34, accent, 0, 0.9);
  ctx.font = `800 34px ${headingFont}`;
  ctx.fillStyle = accent;
  ctx.fillText("Ibirifas", center, H - 70);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen."))), "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Not right away: iOS Safari reads the file after the click returns, and a
  // revoked URL leaves it with an empty preview.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Whether this browser can hand a PNG to the system share sheet (iPhone/Android: yes; most desktops: no). */
export function canShareImageFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function" || typeof navigator.share !== "function") {
    return false;
  }
  try {
    return navigator.canShare({ files: [new File([""], "rifa.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

export type ShareOutcome = "shared" | "cancelled" | "failed";

/**
 * Opens the system share sheet with the image, where "Guardar imagen" puts it in
 * Fotos and WhatsApp & co. take it directly. "cancelled" means the person closed
 * the sheet; "failed" is anything else (typically the browser refusing because
 * too much time passed since the tap), and the caller should offer a fallback.
 */
export async function shareImageFile(blob: Blob, filename: string, title: string): Promise<ShareOutcome> {
  try {
    const file = new File([blob], filename, { type: "image/png" });
    if (!navigator.canShare?.({ files: [file] })) return "failed";
    await navigator.share({ files: [file], title });
    return "shared";
  } catch (err) {
    return err instanceof DOMException && err.name === "AbortError" ? "cancelled" : "failed";
  }
}

/** A phone or tablet: where a direct file download is awkward and a preview to save from is friendlier. */
export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
