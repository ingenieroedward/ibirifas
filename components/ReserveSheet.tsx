"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Spinner } from "@/components/Spinner";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import type { PublicRaffleDTO, ReserveResultDTO } from "@/lib/types";

interface ReserveSheetProps {
  token: string;
  raffle: PublicRaffleDTO;
  numbers: number[];
  sets: string[];
  total: number;
  /** Closes the sheet; `reserved` is true once the reservation went through. */
  onClose: (reserved: boolean) => void;
}

/** What the visitor typed is remembered on their own device for the next reservation. */
const CONTACT_KEY = "ibirifas_reserve_contact";

function readContact(): { name: string; phone: string } {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CONTACT_KEY) ?? "{}") as { name?: string; phone?: string };
    return { name: saved.name ?? "", phone: saved.phone ?? "" };
  } catch {
    return { name: "", phone: "" };
  }
}

function daysText(days: number): string {
  return days === 1 ? "1 día" : `${days} días`;
}

/** Name + phone, then the confirmation with where to pay. Anonymous: the raffle's secret link is the permission. */
export function ReserveSheet({ token, raffle, numbers, sets, total, onClose }: ReserveSheetProps) {
  const [contact] = useState(readContact);
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReserveResultDTO | null>(null);

  // The payment receipt, attached after reserving (photos are compressed by PhotoPicker before they get here).
  const [receipt, setReceipt] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const holdDays = raffle.reservations.holdDays ?? 0;
  const items = [
    ...sets.map((s) => `Conjunto ${s}`),
    ...numbers.map((v) => formatNumberValue(v)),
  ];

  const submit = async () => {
    if (name.trim().length < 2) return setError("Escribe tu nombre.");
    if (phone.replace(/\D/g, "").length < 7) return setError("Escribe un teléfono válido para poder contactarte.");
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/raffles/${token}/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), numbers, sets }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<ReserveResultDTO> & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo reservar. Inténtalo de nuevo.");
        // Someone got there first: go back to the page, which refreshes what is still free.
        if (res.status === 409) setTimeout(() => onClose(true), 2500);
        return;
      }
      try {
        window.localStorage.setItem(CONTACT_KEY, JSON.stringify({ name: name.trim(), phone: phone.trim() }));
      } catch {
        // Not remembering is fine.
      }
      setResult(body as ReserveResultDTO);
    } catch {
      setError("No se pudo reservar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const sendReceipt = async () => {
    if (!receipt || !result) return;
    setSendingReceipt(true);
    setReceiptError(null);
    try {
      const res = await fetch(`/api/public/raffles/${token}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: result.receiptKey, photoDataUrl: receipt }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setReceiptError(body.error ?? "No se pudo enviar el comprobante. Inténtalo de nuevo.");
        return;
      }
      setReceiptSent(true);
    } catch {
      setReceiptError("No se pudo enviar el comprobante. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSendingReceipt(false);
    }
  };

  if (result) {
    return (
      <BottomSheet title="¡Reserva hecha!" subtitle={`${formatCurrency(result.total)} en total`} onClose={() => onClose(true)}>
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-2.5 font-[family-name:var(--font-heading)] text-base font-bold text-[#241a02]"
            >
              {item}
            </span>
          ))}
        </div>
        <p className="text-sm text-text">
          Quedaron apartados a nombre de <span className="font-semibold">{name.trim()}</span>. Tienes{" "}
          <span className="font-semibold">{daysText(result.holdDays)}</span> para pagar; pasado ese tiempo se liberan para
          otras personas.
        </p>
        {raffle.accounts.length > 0 && (
          <div className="space-y-1 rounded-2xl border border-line bg-surface-2 p-4 text-sm text-text-muted">
            <p className="text-[11px] font-semibold uppercase tracking-wide">Paga aquí</p>
            {raffle.accounts.map((account) => (
              <p key={account.id}>
                <span className="font-semibold text-text">{account.label}</span> {account.number}
                {account.holderName && <span> · {account.holderName}</span>}
              </p>
            ))}
          </div>
        )}
        <div className="space-y-2 rounded-2xl border border-line bg-surface-2 p-4">
          {receiptSent ? (
            <p role="status" className="text-sm font-semibold text-green-400">
              ✓ Comprobante enviado. Quien organiza la rifa lo revisará y confirmará tu pago.
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-text">¿Ya pagaste? Sube tu comprobante</p>
              <PhotoPicker
                label="Foto o captura del pago"
                source="any"
                value={receipt}
                onChange={setReceipt}
                onError={setReceiptError}
                onBusyChange={setPreparing}
              />
              {receipt && (
                <p className="text-xs text-text-muted">
                  Se comprime antes de enviarse ({Math.max(1, Math.round((receipt.length * 0.75) / 1024))} KB).
                </p>
              )}
              {receiptError && (
                <p role="alert" className="text-sm font-medium text-red-400">
                  {receiptError}
                </p>
              )}
              {receipt && (
                <button
                  type="button"
                  onClick={sendReceipt}
                  disabled={sendingReceipt || preparing}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sendingReceipt ? (
                    <>
                      <Spinner size={18} />
                      Enviando…
                    </>
                  ) : (
                    "Enviar comprobante"
                  )}
                </button>
              )}
            </>
          )}
        </div>
        <p className="text-xs text-text-muted">Quien organiza la rifa te va a escribir para confirmar tu pago.</p>
        <button
          type="button"
          onClick={() => onClose(true)}
          className="flex h-12 w-full items-center justify-center rounded-2xl border border-line text-sm font-semibold text-text transition active:scale-[0.98]"
        >
          Listo
        </button>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      title={`Reservar ${items.length} ${items.length === 1 ? "elemento" : "elementos"}`}
      subtitle={`${formatCurrency(total)} en total`}
      onClose={() => onClose(false)}
    >
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-2.5 font-[family-name:var(--font-heading)] text-base font-bold text-[#241a02]"
          >
            {item}
          </span>
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reserveName" className="text-sm font-medium text-text-muted">
          Tu nombre <span className="text-gold-400">*</span>
        </label>
        <input
          id="reserveName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. María Pérez"
          autoComplete="name"
          maxLength={60}
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reservePhone" className="text-sm font-medium text-text-muted">
          Tu teléfono (WhatsApp) <span className="text-gold-400">*</span>
        </label>
        <input
          id="reservePhone"
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

      <p className="text-xs text-text-muted">
        Se apartan a tu nombre y tienes {daysText(holdDays)} para pagar. Si no pagas a tiempo, se liberan.
      </p>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? (
          <>
            <Spinner size={20} />
            Reservando…
          </>
        ) : (
          "Reservar"
        )}
      </button>
    </BottomSheet>
  );
}
