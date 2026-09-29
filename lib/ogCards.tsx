import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { luminance } from "@/lib/color";
import { formatCurrency, formatDrawDate, formatNumberValue } from "@/lib/format";
import type { PublicRaffleDTO } from "@/lib/types";

/**
 * The pictures behind shared links (WhatsApp, Telegram, Facebook…): one for the
 * app itself and one per raffle. Drawn with next/og at 1200x630, the size those
 * apps expect for a large preview.
 */

export const OG_SIZE = { width: 1200, height: 630 };

const GOLD = "#f5c518";
const INK = "#0b0b0f";

type OgFont = { name: string; data: ArrayBuffer; weight: 600 | 800; style: "normal" };
let fontsPromise: Promise<OgFont[]> | null = null;

/** Baloo 2, the app's own type (SIL OFL, files in public/fonts). Read once, then kept. */
export function ogFonts(): Promise<OgFont[]> {
  fontsPromise ??= Promise.all(
    ([800, 600] as const).map(async (weight) => {
      const file = await readFile(join(process.cwd(), "public", "fonts", `baloo-2-latin-${weight}-normal.woff`));
      return { name: "Baloo 2", data: Uint8Array.from(file).buffer, weight, style: "normal" as const };
    }),
  );
  return fontsPromise;
}

function Crown({ height, color }: { height: number; color: string }) {
  return (
    <svg width={height * 1.6} height={height} viewBox="0 0 64 40">
      <path d="M4 34 L0 10 L14 20 L22 4 L32 16 L42 4 L50 20 L64 10 L60 34 Z" fill={color} />
    </svg>
  );
}

/** The app's own card: shown for the login link and any page without a picture of its own. */
export function AppCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: INK,
        backgroundImage: `radial-gradient(circle at 50% 28%, rgba(245,197,24,0.32), rgba(11,11,15,0) 62%)`,
        fontFamily: "Baloo 2",
      }}
    >
      <Crown height={130} color={GOLD} />
      <div style={{ display: "flex", fontSize: 178, fontWeight: 800, color: GOLD, letterSpacing: -3, marginTop: 6 }}>Ibirifas</div>
      <div style={{ display: "flex", fontSize: 46, fontWeight: 600, color: "#a9a9bb", marginTop: 4 }}>
        Vende, cobra y comparte tus rifas
      </div>
    </div>
  );
}

/** Long names/prizes shrink instead of overflowing. */
function fitSize(text: string, steps: [maxChars: number, size: number][], fallback: number): number {
  for (const [maxChars, size] of steps) if (text.length <= maxChars) return size;
  return fallback;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** One raffle's card: name, prize, price and how much is left, in the raffle's own colors. */
export function RaffleCard({ raffle }: { raffle: PublicRaffleDTO }) {
  const background = raffle.themeBackground ?? INK;
  const accent = raffle.themeNumberColor ?? GOLD;
  const dark = luminance(background) < 0.5;
  const text = dark ? "#ffffff" : "#15131c";
  const muted = dark ? "rgba(255,255,255,0.62)" : "rgba(21,19,28,0.62)";
  const panel = dark ? "rgba(0,0,0,0.34)" : "rgba(255,255,255,0.6)";

  const name = clip(raffle.name, 60);
  const prize = clip(raffle.prizeLabel ?? "Por definir", 40);
  const hasSets = raffle.groups.length > 0;
  const closed = raffle.status === "closed";

  const prices = raffle.groups.map((g) => g.price);
  const priceText = hasSets
    ? Math.min(...prices) === Math.max(...prices)
      ? formatCurrency(prices[0]!)
      : `${formatCurrency(Math.min(...prices))} – ${formatCurrency(Math.max(...prices))}`
    : formatCurrency(raffle.numberPrice);

  const free = raffle.numbers.filter((n) => !n.sold).length;
  const freeSets = raffle.groups.filter((g) => !g.sold).length;
  const status = closed
    ? raffle.winnerValue !== null
      ? `Rifa cerrada · Ganó el ${formatNumberValue(raffle.winnerValue)}`
      : "Rifa cerrada"
    : free === 0
      ? "Números agotados"
      : hasSets
        ? `${freeSets} de ${raffle.groups.length} conjuntos disponibles`
        : `${free} ${free === 1 ? "número disponible" : "números disponibles"}`;
  const drawLine = raffle.drawDate ? `Sorteo el ${formatDrawDate(raffle.drawDate)}` : "";
  const lotteryLine = raffle.lottery ? `${drawLine ? "" : "Sorteo con "}${raffle.lottery}` : "";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "44px 64px 48px",
        background,
        backgroundImage: `radial-gradient(circle at 50% 0%, ${accent}40, ${background}00 62%)`,
        fontFamily: "Baloo 2",
        color: text,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Crown height={40} color={accent} />
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: accent, letterSpacing: 1 }}>IBIRIFAS</div>
      </div>

      <div
        style={{
          display: "flex",
          fontSize: fitSize(name, [[20, 112], [30, 92], [44, 74]], 60),
          fontWeight: 800,
          color: accent,
          lineHeight: 1.02,
          letterSpacing: -1,
          maxHeight: 250,
          overflow: "hidden",
        }}
      >
        {name}
      </div>

      <div style={{ display: "flex", gap: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1.35, padding: "16px 28px", background: panel, borderRadius: 26, border: `2px solid ${accent}55` }}>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: muted, letterSpacing: 2 }}>PREMIO</div>
          <div style={{ display: "flex", fontSize: fitSize(prize, [[12, 78], [20, 62], [30, 48]], 38), fontWeight: 800, color: text, lineHeight: 1.05 }}>
            {prize}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "16px 28px", background: panel, borderRadius: 26, border: `2px solid ${accent}55` }}>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: muted, letterSpacing: 2 }}>
            {hasSets ? "VALOR DEL CONJUNTO" : "VALOR DEL NÚMERO"}
          </div>
          <div style={{ display: "flex", fontSize: fitSize(priceText, [[10, 78], [18, 60]], 46), fontWeight: 800, color: text, lineHeight: 1.05 }}>
            {priceText}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
        <div
          style={{
            display: "flex",
            padding: "8px 30px 6px",
            borderRadius: 999,
            background: closed || free === 0 ? panel : accent,
            color: closed || free === 0 ? text : raffle.themeTextColor ?? "#241a02",
            fontSize: 40,
            fontWeight: 800,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {status}
        </div>
        {(drawLine || lotteryLine) && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 0, fontWeight: 600, color: muted }}>
            {drawLine && <div style={{ display: "flex", fontSize: 28, whiteSpace: "nowrap" }}>{drawLine}</div>}
            {lotteryLine && <div style={{ display: "flex", fontSize: 26, whiteSpace: "nowrap" }}>{clip(lotteryLine, 30)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
