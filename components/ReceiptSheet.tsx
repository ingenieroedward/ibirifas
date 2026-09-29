"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Spinner } from "@/components/Spinner";

/** Same key the reservation form uses, so the phone typed there comes back here. */
const CONTACT_KEY = "ibirifas_reserve_contact";

function readPhone(): string {
  try {
    return (JSON.parse(window.localStorage.getItem(CONTACT_KEY) ?? "{}") as { phone?: string }).phone ?? "";
  } catch {
    return "";
  }
}

/**
 * For someone who reserved earlier and now wants to send the proof of payment:
 * the phone they reserved with identifies the reservation. The photo is
 * compressed by PhotoPicker before it leaves the phone.
 */
export function ReceiptSheet({ token, onClose }: { token: string; onClose: () => void }) {
  const [phone, setPhone] = useState(readPhone);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (phone.replace(/\D/g, "").length < 7) return setError("Escribe el teléfono con el que reservaste.");
    if (!receipt) return setError("Elige la foto o captura de tu pago.");
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/raffles/${token}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), photoDataUrl: receipt }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "No se pudo enviar el comprobante. Inténtalo de nuevo.");
        return;
      }
      setSent(true);
    } catch {
      setError("No se pudo enviar el comprobante. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet title="Subir comprobante" subtitle="Para una reserva que ya hiciste" onClose={onClose}>
      {sent ? (
        <>
          <p role="status" className="text-sm font-semibold text-green-400">
            ✓ Comprobante enviado. Quien organiza la rifa lo revisará y confirmará tu pago.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-full items-center justify-center rounded-2xl border border-line text-sm font-semibold text-text transition active:scale-[0.98]"
          >
            Listo
          </button>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <label htmlFor="receiptPhone" className="text-sm font-medium text-text-muted">
              Teléfono con el que reservaste <span className="text-gold-400">*</span>
            </label>
            <input
              id="receiptPhone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej. 3001234567"
              autoComplete="tel"
              maxLength={30}
              className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400"
            />
          </div>

          <PhotoPicker
            label="Foto o captura del pago"
            source="any"
            value={receipt}
            onChange={setReceipt}
            onError={setError}
            onBusyChange={setPreparing}
          />
          {receipt && (
            <p className="-mt-3 text-xs text-text-muted">
              Se comprime antes de enviarse ({Math.max(1, Math.round((receipt.length * 0.75) / 1024))} KB).
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm font-medium text-red-400">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={send}
            disabled={sending || preparing}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-on-accent shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? (
              <>
                <Spinner size={20} />
                Enviando…
              </>
            ) : (
              "Enviar comprobante"
            )}
          </button>
        </>
      )}
    </BottomSheet>
  );
}
