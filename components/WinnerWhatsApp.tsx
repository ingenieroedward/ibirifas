"use client";

import { useState } from "react";
import { prizeDigits, prizeKindLabel } from "@/lib/prizes";
import { describeHolder } from "@/components/CloseRaffleSheet";
import { buildWinnerMessage, whatsAppUrl } from "@/lib/whatsapp";
import { formatNumberValue } from "@/lib/format";
import { canShareImageFiles, downloadBlob, generateWinnerImage, isTouchDevice, shareImageFile } from "@/lib/shareImage";
import { ImagePreviewSheet } from "@/components/ImagePreviewSheet";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import type { RaffleDTO } from "@/lib/types";

type RaffleLike = Pick<RaffleDTO, "id" | "name" | "numbers" | "themeBackground" | "themeNumberColor" | "themeTextColor">;

/**
 * After a draw: "Avisar al ganador por WhatsApp" (the organizer's own WhatsApp opens with the congratulations
 * ready, to the winner's phone when there is one) and the winner's image for a WhatsApp status, thanking
 * everyone who played. Without a buyer for the number only the image is offered ("nadie lo tenía").
 */
export function WinnerWhatsApp({
  raffle,
  winnerValue,
  prize,
  stageLabel,
  drawDate,
  lottery,
  outcome = null,
}: {
  raffle: RaffleLike;
  winnerValue: number;
  prize: string | null;
  stageLabel: string | null;
  drawDate: string | null;
  lottery: string | null;
  /** A stage's result ("house": the number wasn't up to date, nobody wins); null for a plain raffle. */
  outcome?: "won" | "house" | null;
}) {
  const number = raffle.numbers.find((n) => n.value === winnerValue);
  const sold = Boolean(number && number.status !== "available") && outcome !== "house";
  const winnerName = sold ? (number!.buyerName ?? "Ganador") : null;
  const noWinnerReason = outcome === "house" && number && number.status !== "available" ? "notUpToDate" : "nobody";
  const buildImage = () =>
    generateWinnerImage({
      raffleName: raffle.name,
      themeBackground: raffle.themeBackground,
      themeNumberColor: raffle.themeNumberColor,
      themeTextColor: raffle.themeTextColor,
      winnerValue,
      winnerName,
      noWinnerReason,
      prize,
      stageLabel,
      lottery,
      drawDate,
    });
  const filename = `ganador-${winnerValue}${stageLabel ? `-${stageLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}.png`;

  const text = sold
    ? buildWinnerMessage({ buyerName: number!.buyerName, raffleName: raffle.name, winnerValue, prize, stageLabel, lottery, drawDate })
    : "";

  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      {sold && (
        <a
          href={whatsAppUrl(number!.buyerPhone, text)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 items-center sm:flex-1 justify-center gap-2 rounded-xl bg-[#25d366] px-3 text-sm font-bold text-[#062b14] transition active:scale-[0.98]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.3z" />
          </svg>
          <span className="truncate">Avisar {number!.buyerName ? `a ${number!.buyerName.trim().split(/\s+/)[0]}` : "al ganador"} por WhatsApp</span>
        </a>
      )}
      <StatusImageButton build={buildImage} filename={filename} title={`Ganador · ${raffle.name}`} />
    </div>
  );
}

const WA_ICON = (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.3z" />
  </svg>
);

/** Makes the winners' image and gets it out: the share sheet on phones, a preview to save, or a download. */
function StatusImageButton({ build, filename, title }: { build: () => Promise<Blob>; filename: string; title: string }) {
  const { show } = useToast();
  const [making, setMaking] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const make = async () => {
    setMaking(true);
    try {
      const blob = await build();
      if (canShareImageFiles()) {
        const outcome = await shareImageFile(blob, filename, title);
        if (outcome === "failed") setPreview({ blob, url: URL.createObjectURL(blob) });
      } else if (isTouchDevice()) {
        setPreview({ blob, url: URL.createObjectURL(blob) });
      } else {
        downloadBlob(blob, filename);
        show("Imagen descargada", "success");
      }
    } catch {
      show("No se pudo crear la imagen. Inténtalo de nuevo.", "error");
    } finally {
      setMaking(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => void make()}
        disabled={making}
        className="flex h-11 items-center justify-center gap-2 rounded-xl border border-gold-600/50 bg-gold-400/10 px-3 text-sm font-bold text-gold-400 transition active:scale-[0.98] disabled:opacity-60 sm:flex-1"
      >
        {making ? <Spinner size={16} /> : "Imagen para el estado"}
      </button>
      {preview && (
        <ImagePreviewSheet
          blob={preview.blob}
          url={preview.url}
          filename={filename}
          title={title}
          onClose={() => {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
        />
      )}
    </>
  );
}

/**
 * "Gana Más" after closing: every prize the lottery result gave — number, who has it, what it pays, or that it stays
 * with the organizer — with a WhatsApp button per winner and one image with all of them.
 */
export function PrizeWinners({
  raffle,
}: {
  raffle: RaffleLike & Pick<RaffleDTO, "groups" | "prizeResults" | "totalNumbers" | "lottery" | "drawDate" | "winnerValue">;
}) {
  const digits = prizeDigits(raffle.totalNumbers);
  const numberOf = (v: number) => raffle.numbers.find((n) => n.value === v);
  const main = raffle.prizeResults.find((w) => w.kind === "main");
  const extrasWon = raffle.prizeResults.filter((w) => w.kind !== "main" && w.won);
  const buildImage = () =>
    generateWinnerImage({
      raffleName: raffle.name,
      themeBackground: raffle.themeBackground,
      themeNumberColor: raffle.themeNumberColor,
      themeTextColor: raffle.themeTextColor,
      winnerValue: main?.value ?? raffle.winnerValue ?? 0,
      winnerName: main?.won ? (numberOf(main.value)?.buyerName ?? "Ganador") : null,
      prize: main?.prize ?? null,
      lottery: raffle.lottery,
      drawDate: raffle.drawDate,
      others: extrasWon.map((w) => ({
        label: prizeKindLabel(w.kind, digits),
        value: w.value,
        name: numberOf(w.value)?.buyerName ?? "Ganador",
        prize: w.prize,
      })),
    });

  return (
    <div className="mt-3 space-y-2">
      <ul className="space-y-2" aria-label="Ganadores">
        {raffle.prizeResults.map((w, i) => {
          const n = numberOf(w.value);
          const label = prizeKindLabel(w.kind, digits);
          const text = buildWinnerMessage({
            buyerName: n?.buyerName ?? null,
            raffleName: raffle.name,
            winnerValue: w.value,
            prize: w.prize,
            lottery: raffle.lottery,
            drawDate: raffle.drawDate,
            ...(w.kind === "main" ? {} : { prizeLabel: label, drawnValue: main?.value ?? null }),
          });
          return (
            <li key={`${w.kind}-${w.value}-${i}`} className="rounded-xl border border-line bg-bg-elevated/60 p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-gold-300 to-gold-500 font-[family-name:var(--font-heading)] text-base font-extrabold text-[#241a02]">
                  {formatNumberValue(w.value)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">
                    {label}
                    {w.prize ? <span className="font-normal text-text-muted"> · {w.prize}</span> : null}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {w.won ? describeHolder(raffle, w.value) : n && n.status !== "available" ? "No estaba pagado: queda en la casa" : "Nadie lo tenía: queda en la casa"}
                  </span>
                </span>
              </div>
              {w.won && n && n.status !== "available" && (
                <a
                  href={whatsAppUrl(n.buyerPhone, text)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex h-10 items-center justify-center gap-2 rounded-lg bg-[#25d366] px-3 text-sm font-bold text-[#062b14] transition active:scale-[0.98]"
                >
                  {WA_ICON}
                  <span className="truncate">Avisar {n.buyerName ? `a ${n.buyerName.trim().split(/\s+/)[0]}` : "al ganador"} por WhatsApp</span>
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col sm:flex-row">
        <StatusImageButton build={buildImage} filename={`ganadores-${main?.value ?? "rifa"}.png`} title={`Ganadores · ${raffle.name}`} />
      </div>
    </div>
  );
}
