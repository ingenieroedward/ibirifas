"use client";

import { useState } from "react";
import { buildWinnerMessage, whatsAppUrl } from "@/lib/whatsapp";
import { canShareImageFiles, downloadBlob, generateWinnerImage, isTouchDevice, shareImageFile } from "@/lib/shareImage";
import { ImagePreviewSheet } from "@/components/ImagePreviewSheet";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import type { RaffleDTO } from "@/lib/types";

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
  raffle: Pick<RaffleDTO, "id" | "name" | "numbers" | "themeBackground" | "themeNumberColor" | "themeTextColor">;
  winnerValue: number;
  prize: string | null;
  stageLabel: string | null;
  drawDate: string | null;
  lottery: string | null;
  /** A stage's result ("house": the number wasn't up to date, nobody wins); null for a plain raffle. */
  outcome?: "won" | "house" | null;
}) {
  const { show } = useToast();
  const [making, setMaking] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; url: string; filename: string } | null>(null);
  const number = raffle.numbers.find((n) => n.value === winnerValue);
  const sold = Boolean(number && number.status !== "available") && outcome !== "house";
  const winnerName = sold ? (number!.buyerName ?? "Ganador") : null;
  const noWinnerReason = outcome === "house" && number && number.status !== "available" ? "notUpToDate" : "nobody";

  const makeImage = async () => {
    setMaking(true);
    try {
      const blob = await generateWinnerImage({
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
      if (canShareImageFiles()) {
        const outcome = await shareImageFile(blob, filename, `Ganador · ${raffle.name}`);
        if (outcome === "failed") setPreview({ blob, url: URL.createObjectURL(blob), filename });
      } else if (isTouchDevice()) {
        setPreview({ blob, url: URL.createObjectURL(blob), filename });
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
      <button
        type="button"
        onClick={() => void makeImage()}
        disabled={making}
        className="flex h-11 items-center sm:flex-1 justify-center gap-2 rounded-xl border border-gold-600/50 bg-gold-400/10 px-3 text-sm font-bold text-gold-400 transition active:scale-[0.98] disabled:opacity-60"
      >
        {making ? <Spinner size={16} /> : "Imagen para el estado"}
      </button>
      {preview && (
        <ImagePreviewSheet
          blob={preview.blob}
          url={preview.url}
          filename={preview.filename}
          title={`Ganador · ${raffle.name}`}
          onClose={() => {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
