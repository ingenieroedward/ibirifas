"use client";

import { useState } from "react";
import { AccountsList } from "@/components/AccountsList";
import { PayerNameInput, payerNameError } from "@/components/PayerNameInput";
import { BottomSheet } from "@/components/BottomSheet";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Spinner } from "@/components/Spinner";
import { formatCurrency, formatDrawDate, formatNumberValue } from "@/lib/format";
import { rememberReservation, reservationPath } from "@/lib/myReservations";
import { TurnstileWidget } from "@/components/TurnstileWidget";
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

function readContact(): { name: string; phone: string; email: string } {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CONTACT_KEY) ?? "{}") as { name?: string; phone?: string; email?: string };
    return { name: saved.name ?? "", phone: saved.phone ?? "", email: saved.email ?? "" };
  } catch {
    return { name: "", phone: "", email: "" };
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
  const [email, setEmail] = useState(contact.email);
  const askEmail = raffle.reservations.email;
  const turnstileKey = raffle.reservations.turnstileSiteKey;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReserveResultDTO | null>(null);

  // The payment receipt, attached after reserving (photos are compressed by PhotoPicker before they get here).
  const [receipt, setReceipt] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [payerName, setPayerName] = useState(contact.name);

  const holdDays = raffle.reservations.holdDays ?? 0;
  const items = [
    ...sets.map((s) => `Conjunto ${s}`),
    ...numbers.map((v) => formatNumberValue(v)),
  ];

  const submit = async () => {
    if (name.trim().length < 2) return setError("Escribe tu nombre.");
    if (phone.replace(/\D/g, "").length < 7) return setError("Escribe un teléfono válido para poder contactarte.");
    const mail = askEmail ? email.trim() : "";
    if (mail && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(mail)) return setError("Revisa tu correo: no parece válido.");
    if (!acceptPrivacy) return setError("Para reservar debes aceptar el aviso de privacidad.");
    if (turnstileKey && !turnstileToken) return setError("Espera a que termine la verificación de abajo.");
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/raffles/${token}/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), ...(mail ? { email: mail } : {}), ...(turnstileToken ? { turnstileToken } : {}), acceptPrivacy, numbers, sets }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<ReserveResultDTO> & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo reservar. Inténtalo de nuevo.");
        // A token is good for one try.
        if (turnstileKey) {
          setTurnstileToken(null);
          setTurnstileReset((n) => n + 1);
        }
        // Someone got there first: go back to the page, which refreshes what is still free.
        if (res.status === 409) setTimeout(() => onClose(true), 2500);
        return;
      }
      try {
        window.localStorage.setItem(CONTACT_KEY, JSON.stringify({ name: name.trim(), phone: phone.trim(), email: mail }));
        rememberReservation(token, (body as ReserveResultDTO).receiptKey);
      } catch {
        // Not remembering is fine.
      }
      setResult(body as ReserveResultDTO);
      setPayerName(name.trim());
    } catch {
      setError("No se pudo reservar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const sendReceipt = async () => {
    if (!receipt || !result) return;
    const payerProblem = payerNameError(payerName);
    if (payerProblem) return setReceiptError(payerProblem);
    setSendingReceipt(true);
    setReceiptError(null);
    try {
      const res = await fetch(`/api/public/raffles/${token}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: result.receiptKey, photoDataUrl: receipt, payerName: payerName.trim() }),
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
              className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-2.5 font-[family-name:var(--font-heading)] text-base font-bold text-on-accent"
            >
              {item}
            </span>
          ))}
        </div>
        <p className="text-sm text-text">
          Quedaron apartados a nombre de <span className="font-semibold">{name.trim()}</span>.{" "}
          {result.payBy ? (
            <>
              Tienes hasta el <span className="font-semibold">{formatDrawDate(result.payBy)}</span> (el día antes del sorteo) para
              pagar; si no, se liberan para otras personas.
            </>
          ) : (
            <>
              Tienes <span className="font-semibold">{daysText(result.holdDays)}</span> para pagar; pasado ese tiempo se liberan
              para otras personas.
            </>
          )}
        </p>
        {raffle.accounts.length > 0 && (
          <div className="space-y-1 rounded-2xl border border-line bg-surface-2 p-4 text-sm text-text-muted">
            <p className="text-[11px] font-semibold uppercase tracking-wide">Paga aquí</p>
            <AccountsList accounts={raffle.accounts} token={token} />
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
              {receipt && <PayerNameInput id="reservePayerName" value={payerName} onChange={setPayerName} />}
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
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-bold text-on-accent shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
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
        <a
          href={reservationPath(token, result.receiptKey)}
          className="flex h-12 w-full items-center justify-center rounded-2xl border border-gold-600/50 text-sm font-semibold text-gold-400 transition active:scale-[0.98]"
        >
          Ver mi reserva
        </a>
        <p className="text-xs text-text-muted">
          {askEmail && email.trim()
            ? `Te escribiremos a ${email.trim()} cuando confirmen o rechacen tu pago. También puedes revisarlo en "Ver mi reserva" (guarda ese enlace).`
            : "En \"Ver mi reserva\" puedes revisar cuando confirmen tu pago (guarda ese enlace)."}
        </p>
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
            className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-2.5 font-[family-name:var(--font-heading)] text-base font-bold text-on-accent"
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

      {askEmail && (
        <div className="space-y-1.5">
          <label htmlFor="reserveEmail" className="text-sm font-medium text-text-muted">
            Tu correo (opcional)
          </label>
          <input
            id="reserveEmail"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Ej. maria@gmail.com"
            autoComplete="email"
            maxLength={120}
            className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400"
          />
          <p className="text-xs text-text-muted">Te avisamos ahí cuando confirmen o rechacen tu pago.</p>
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-3">
        <input
          id="acceptPrivacy"
          type="checkbox"
          checked={acceptPrivacy}
          onChange={(e) => setAcceptPrivacy(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-gold-400)]"
        />
        <span className="text-xs text-text-muted">
          Acepto el{" "}
          <a href={`/p/${token}/privacidad`} target="_blank" rel="noopener noreferrer" className="font-semibold text-gold-400 underline">
            aviso de privacidad
          </a>{" "}
          y autorizo el uso de mis datos para gestionar mi reserva.
        </span>
      </label>

      {turnstileKey && (
        <TurnstileWidget
          key={turnstileReset}
          siteKey={turnstileKey}
          onToken={setTurnstileToken}
          onError={setError}
        />
      )}

      <p className="text-xs text-text-muted">
        Se apartan a tu nombre y tienes{" "}
        {raffle.reservations.payBy ? `hasta el ${formatDrawDate(raffle.reservations.payBy)} (el día antes del sorteo)` : daysText(holdDays)} para
        pagar. Si no pagas a tiempo, se liberan.
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
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-on-accent shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
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
