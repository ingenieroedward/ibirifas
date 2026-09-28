import { darken, lighten, luminance, withAlpha } from "@/lib/color";
import { formatCurrency, formatDate, formatNumberValue } from "@/lib/format";
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
  // computable up front. Optional bands (facts-per-column, accounts) still
  // add a deterministic amount of height based only on *counts*, never on
  // measured text, so this stays fully predictable before anything is drawn.
  const HEADER_TOP = 40;
  const CROWN_WIDTH = 96;
  const CROWN_HEIGHT = (40 * CROWN_WIDTH) / 64;
  const TITLE_GAP = 16;
  const TITLE_MAX_SIZE = 44;
  const TITLE_MIN_SIZE = 26;
  const TITLE_HEIGHT = 52;
  const FACTS_GAP = 18;
  const FACTS_HEIGHT = 84;
  const ACCOUNTS_GAP = 16;
  // 2 per row (not 3): a chip carrying "Label number · Responsable: Name" needs
  // real width to stay legible instead of truncating the one detail — the
  // payee's name — that buyers actually need to read.
  const ACCOUNTS_PER_ROW = 2;
  const ACCOUNT_CHIP_HEIGHT = 38;
  const ACCOUNT_ROW_GAP = 10;
  const DIVIDER_GAP = 20;
  const LEGEND_HEIGHT = 30;
  const GRID_TOP_GAP = 28;
  const GRID_BOTTOM_GAP = 40;
  const FOOTER_HEIGHT = 40;

  // "Key facts" band: premio · valor · fecha as short badge-style columns in
  // one compact card, instead of separate full-width centered lines.
  const factsColumns: { label: string; value: string }[] = [];
  if (raffle.prizeLabel) factsColumns.push({ label: "Premio", value: raffle.prizeLabel });
  factsColumns.push({ label: "Valor", value: formatCurrency(raffle.numberPrice) });
  if (raffle.drawDate) factsColumns.push({ label: "Fecha", value: formatDate(raffle.drawDate) });

  const accountsCount = raffle.accounts.length;
  const accountsRows = accountsCount > 0 ? Math.ceil(accountsCount / ACCOUNTS_PER_ROW) : 0;
  const accountsHeight =
    accountsRows > 0 ? accountsRows * ACCOUNT_CHIP_HEIGHT + (accountsRows - 1) * ACCOUNT_ROW_GAP : 0;

  const headerHeight =
    HEADER_TOP +
    CROWN_HEIGHT +
    TITLE_GAP +
    TITLE_HEIGHT +
    FACTS_GAP +
    FACTS_HEIGHT +
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

  drawCrown(ctx, CANVAS_WIDTH / 2, cursorY, CROWN_WIDTH, theme.numberColor);
  cursorY += CROWN_HEIGHT + TITLE_GAP;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const titleMaxWidth = CANVAS_WIDTH - SIDE_PADDING * 2;
  const { fontSize: titleSize, text: titleText } = fitFontSize(
    ctx,
    raffle.name,
    titleMaxWidth,
    TITLE_MAX_SIZE,
    TITLE_MIN_SIZE,
    "800",
  );
  ctx.font = `800 ${titleSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = theme.numberColor;
  ctx.fillText(titleText, CANVAS_WIDTH / 2, cursorY + titleSize * 0.78);
  cursorY += TITLE_HEIGHT + FACTS_GAP;

  // Facts card: premio / valor / fecha as unified badge-style columns, echoing
  // the divided-card look of the on-screen prize/price info block instead of
  // reading as a stack of separate centered lines.
  drawRoundedRect(ctx, gridStartX, cursorY, gridWidth, FACTS_HEIGHT, 20);
  ctx.fillStyle = soldTileFill;
  ctx.fill();
  ctx.strokeStyle = withAlpha(theme.numberColor, 0.3);
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, gridStartX, cursorY, gridWidth, FACTS_HEIGHT, 20);
  ctx.stroke();

  const colWidth = gridWidth / factsColumns.length;
  const colPaddingX = 16;
  ctx.textAlign = "center";
  factsColumns.forEach((col, i) => {
    const colCenterX = gridStartX + colWidth * i + colWidth / 2;
    if (i > 0) {
      ctx.strokeStyle = withAlpha(dark ? "#ffffff" : "#000000", 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gridStartX + colWidth * i, cursorY + 14);
      ctx.lineTo(gridStartX + colWidth * i, cursorY + FACTS_HEIGHT - 14);
      ctx.stroke();
    }

    ctx.font = `700 15px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = mutedText;
    ctx.fillText(col.label.toUpperCase(), colCenterX, cursorY + 28);

    const maxValueWidth = colWidth - colPaddingX * 2;
    const { fontSize, text } = fitFontSize(ctx, col.value, maxValueWidth, 24, 14, "800");
    ctx.font = `800 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = theme.numberColor;
    ctx.fillText(text, colCenterX, cursorY + FACTS_HEIGHT - 20);
  });

  cursorY += FACTS_HEIGHT;

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
      ctx.fillStyle = withAlpha(theme.numberColor, dark ? 0.14 : 0.1);
      ctx.fill();
      ctx.strokeStyle = withAlpha(theme.numberColor, 0.4);
      ctx.lineWidth = 1.3;
      drawRoundedRect(ctx, x, y, chipWidth, ACCOUNT_CHIP_HEIGHT, ACCOUNT_CHIP_HEIGHT / 2);
      ctx.stroke();

      const label = account.holderName
        ? `${account.label} ${account.number} · Responsable: ${account.holderName}`
        : `${account.label} ${account.number}`;
      const { fontSize, text } = fitFontSize(ctx, label, chipWidth - 24, 18, 13, "600");
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = dark ? "#f5f3ff" : "#131218";
      ctx.textAlign = "center";
      ctx.fillText(text, x + chipWidth / 2, y + ACCOUNT_CHIP_HEIGHT / 2 + fontSize * 0.32);
    });

    cursorY += accountsHeight;
  }

  cursorY += DIVIDER_GAP;

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
