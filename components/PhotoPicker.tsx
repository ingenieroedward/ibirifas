"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { fileToCompressedDataUrl } from "@/lib/image";
import { Spinner } from "@/components/Spinner";

interface PhotoPickerProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  onError: (message: string) => void;
  /** Lets the parent hold its save button while a photo is still being compressed. */
  onBusyChange?: (busy: boolean) => void;
}

/** Camera/gallery picker for the payment-proof photo, compressed before it leaves the phone. */
export function PhotoPicker({ value, onChange, onError, onBusyChange }: PhotoPickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProcessing(true);
    onBusyChange?.(true);
    try {
      onChange(await fileToCompressedDataUrl(file, { maxSize: 1000, quality: 0.72 }));
    } catch {
      onError("No se pudo procesar la foto. Inténtalo de nuevo.");
    } finally {
      setProcessing(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-text-muted">Foto del comprobante</span>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative block h-40 w-full overflow-hidden rounded-2xl border border-line"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Comprobante" className="h-full w-full object-cover" />
          <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
            Cambiar
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={processing}
          className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface-2 text-text-muted transition active:scale-[0.98] disabled:opacity-60"
        >
          {processing ? (
            <Spinner size={24} />
          ) : (
            <>
              <CameraIcon className="h-7 w-7 text-gold-400" />
              <span className="text-sm font-medium">Tomar foto</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
