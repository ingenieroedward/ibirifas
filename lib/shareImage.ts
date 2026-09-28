import { darken, lighten, luminance, withAlpha } from "@/lib/color";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { DEFAULT_THEME, resolvedTheme } from "@/lib/theme";
import type { RaffleDTO } from "@/lib/types";

/**
 * Renders a shareable "which numbers are still available" board as a PNG,
 * matching the app's dark/gold poster look (see app/globals.css and
 * components/icons/Crown.tsx) so it reads as the same product, not a generic
 * screenshot. Client-side only — never touches the server.
 */

const CANVAS_WIDTH = 1080;
const SIDE_PADDING = 64;
const GRID_GAP = 16;
const MAX_CELL_SIZE = 140;
const MIN_CELL_SIZE = 38;

// Same brush-gold crown path as components/icons/Crown.tsx (viewBox 64x40),
// redrawn on canvas since SVG components can't be reused directly here.
const CROWN_PATH = "M4 34 L0 10 L14 20 L22 4 L32 16 L42 4 L50 20 L64 10 L60 34 Z";

function pickColumns(total: number): number {
  if (total <= 20) return 4;
  if (total <= 40) return 5;
  if (total <= 80) return 6;
  if (total <= 160) return 8;
  if (total <= 400) return 10;
  if (total <= 700) return 12;
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

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  weight = "800",
): { fontSize: number; text: string } {
  let fontSize = maxSize;
  while (fontSize > minSize) {
    ctx.font = `${weight} ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) {
      return { fontSize, text };
    }
    fontSize -= 2;
  }
  ctx.font = `${weight} ${minSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return { fontSize: minSize, text: truncated.length < text.length ? `${truncated}…` : truncated };
}

function drawCrown(ctx: CanvasRenderingContext2D, centerX: number, top: number, width: number, color: string) {
  const scale = width / 64;
  const height = 40 * scale;
  ctx.save();
  ctx.translate(centerX - width / 2, top);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(CROWN_PATH));
  drawRoundedRect(ctx, 2, 34, 60, 5, 2);
  ctx.fill();
  ctx.restore();
  return height;
}

export async function generateRaffleShareImage(raffle: RaffleDTO): Promise<Blob> {
  const theme = resolvedTheme(raffle);
  const total = raffle.numbers.length || raffle.totalNumbers;
  const sorted = [...raffle.numbers].sort((a, b) => a.value - b.value);

  const columns = pickColumns(total);
  const rows = Math.max(1, Math.ceil(sorted.length / columns));
  const availWidth = CANVAS_WIDTH - SIDE_PADDING * 2;
  const rawCell = (availWidth - (columns - 1) * GRID_GAP) / columns;
  const cellSize = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, rawCell));
  const gridWidth = columns * cellSize + (columns - 1) * GRID_GAP;
  const gridStartX = (CANVAS_WIDTH - gridWidth) / 2;

  // Header block heights are fixed regardless of content length (long titles
  // shrink/truncate instead of wrapping), so total canvas height is fully
  // computable up front.
  const HEADER_TOP = 56;
  const CROWN_HEIGHT = 92;
  const TITLE_GAP = 26;
  const TITLE_HEIGHT = 66;
  const PRIZE_GAP = 18;
  const PRIZE_HEIGHT = raffle.prizeLabel ? 44 : 0;
  const PRICE_GAP = raffle.prizeLabel ? 10 : 18;
  const PRICE_HEIGHT = 38;
  const DIVIDER_GAP = 30;
  const LEGEND_HEIGHT = 34;
  const GRID_TOP_GAP = 34;
  const GRID_BOTTOM_GAP = 48;
  const FOOTER_HEIGHT = 46;

  const headerHeight =
    HEADER_TOP +
    CROWN_HEIGHT +
    TITLE_GAP +
    TITLE_HEIGHT +
    PRIZE_GAP +
    PRIZE_HEIGHT +
    PRICE_GAP +
    PRICE_HEIGHT +
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

  // Background.
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft glow behind the header, echoing the app's gold shadow-glow style.
  const glow = ctx.createRadialGradient(
    CANVAS_WIDTH / 2,
    HEADER_TOP + CROWN_HEIGHT + 40,
    10,
    CANVAS_WIDTH / 2,
    HEADER_TOP + CROWN_HEIGHT + 40,
    CANVAS_WIDTH * 0.6,
  );
  glow.addColorStop(0, withAlpha(theme.numberColor, dark ? 0.22 : 0.14));
  glow.addColorStop(1, withAlpha(theme.numberColor, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, headerHeight + 60);

  let cursorY = HEADER_TOP;

  drawCrown(ctx, CANVAS_WIDTH / 2, cursorY, 150, theme.numberColor);
  cursorY += CROWN_HEIGHT + TITLE_GAP;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const titleMaxWidth = CANVAS_WIDTH - SIDE_PADDING * 2;
  const { fontSize: titleSize, text: titleText } = fitFontSize(ctx, raffle.name, titleMaxWidth, 56, 30, "800");
  ctx.font = `800 ${titleSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = theme.numberColor;
  ctx.fillText(titleText, CANVAS_WIDTH / 2, cursorY + titleSize * 0.78);
  cursorY += TITLE_HEIGHT + PRIZE_GAP;

  if (raffle.prizeLabel) {
    const { fontSize, text } = fitFontSize(ctx, `Premio: ${raffle.prizeLabel}`, titleMaxWidth, 30, 20, "700");
    ctx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = dark ? "#f5f3ff" : "#131218";
    ctx.fillText(text, CANVAS_WIDTH / 2, cursorY + fontSize * 0.8);
    cursorY += PRIZE_HEIGHT + PRICE_GAP;
  }

  ctx.font = `600 26px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = mutedText;
  ctx.fillText(`Valor por número: ${formatCurrency(raffle.numberPrice)}`, CANVAS_WIDTH / 2, cursorY + 20);
  cursorY += PRICE_HEIGHT + DIVIDER_GAP;

  // Divider.
  ctx.strokeStyle = withAlpha(theme.numberColor, 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gridStartX, cursorY);
  ctx.lineTo(gridStartX + gridWidth, cursorY);
  ctx.stroke();
  cursorY += 0;

  // Legend.
  const legendY = cursorY + LEGEND_HEIGHT / 2 + 6;
  ctx.font = `600 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "left";
  const swatch = 20;
  let legendX = gridStartX;
  ctx.fillStyle = theme.numberColor;
  drawRoundedRect(ctx, legendX, legendY - swatch + 4, swatch, swatch, 5);
  ctx.fill();
  legendX += swatch + 10;
  ctx.fillStyle = mutedText;
  ctx.fillText("Disponible", legendX, legendY);
  legendX += ctx.measureText("Disponible").width + 32;

  ctx.fillStyle = soldTileFill;
  drawRoundedRect(ctx, legendX, legendY - swatch + 4, swatch, swatch, 5);
  ctx.fill();
  ctx.strokeStyle = soldTileBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  legendX += swatch + 10;
  ctx.fillStyle = mutedText;
  ctx.fillText("Vendido / apartado", legendX, legendY);

  cursorY += LEGEND_HEIGHT + GRID_TOP_GAP;

  // Grid.
  const tileRadius = cellSize * 0.26;
  const numberFontSize = Math.max(13, Math.min(34, cellSize * 0.38));
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
      const gradient = ctx.createLinearGradient(x, y, x, y + cellSize);
      gradient.addColorStop(0, lighten(theme.numberColor, 0.22));
      gradient.addColorStop(1, theme.numberColor);
      ctx.fillStyle = gradient;
      drawRoundedRect(ctx, x, y, cellSize, cellSize, tileRadius);
      ctx.shadowColor = withAlpha(theme.numberColor, 0.45);
      ctx.shadowBlur = cellSize * 0.18;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      ctx.fillStyle = theme.textColor || DEFAULT_THEME.textColor;
      ctx.font = `800 ${numberFontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.fillText(formatNumberValue(number.value), cx, cy + numberFontSize * 0.03);
    } else {
      // Occupied/paid: dimmed tile + a clear diagonal cross so "still
      // available" reads at a glance, which is the whole point of the image.
      ctx.fillStyle = soldTileFill;
      drawRoundedRect(ctx, x, y, cellSize, cellSize, tileRadius);
      ctx.fill();
      ctx.strokeStyle = soldTileBorder;
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, x, y, cellSize, cellSize, tileRadius);
      ctx.stroke();

      ctx.fillStyle = mutedText;
      ctx.font = `700 ${numberFontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
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

  // Footer brand mark.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 24px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = withAlpha(theme.numberColor, 0.9);
  ctx.fillText("Ibirifas", CANVAS_WIDTH / 2, cursorY + 24);

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
