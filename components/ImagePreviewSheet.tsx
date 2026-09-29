"use client";

import { useState } from "react";
import { canShareImageFiles, downloadBlob, shareImageFile } from "@/lib/shareImage";
import { BottomSheet } from "@/components/BottomSheet";

interface ImagePreviewSheetProps {
  blob: Blob;
  /** Object URL of `blob`, owned by the caller (which revokes it on close). */
  url: string;
  filename: string;
  title: string;
  onClose: () => void;
}

/**
 * The image itself, with the ways to get it out: share sheet (Fotos, WhatsApp…),
 * download, or press-and-hold on the picture. The safety net for phones where the
 * share sheet couldn't open straight from the button.
 */
export function ImagePreviewSheet({ blob, url, filename, title, onClose }: ImagePreviewSheetProps) {
  const [note, setNote] = useState<string | null>(null);
  const canShare = canShareImageFiles();

  const handleShare = async () => {
    setNote(null);
    const outcome = await shareImageFile(blob, filename, title);
    if (outcome === "failed") setNote("No se pudo abrir el menú de compartir. Mantén presionada la imagen para guardarla.");
  };

  return (
    <BottomSheet title="Imagen para compartir" subtitle={title} onClose={onClose}>
      <div className="overflow-hidden rounded-2xl border border-line bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`Imagen de la rifa ${title}`} className="mx-auto max-h-[55dvh] w-auto object-contain" />
      </div>

      {note && <p className="text-sm font-medium text-gold-400">{note}</p>}

      {canShare && (
        <button
          type="button"
          onClick={handleShare}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98]"
        >
          Compartir o guardar en Fotos
        </button>
      )}
      <button
        type="button"
        onClick={() => downloadBlob(blob, filename)}
        className="flex h-12 w-full items-center justify-center rounded-2xl border border-gold-600/40 text-sm font-semibold text-gold-400 transition active:scale-[0.98]"
      >
        Descargar archivo
      </button>
      <p className="text-center text-xs text-text-muted">
        También puedes mantener presionada la imagen y elegir “Guardar en Fotos”.
      </p>
    </BottomSheet>
  );
}
