"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate, formatNumberValue } from "@/lib/format";
import { rememberReservation } from "@/lib/myReservations";
import { pageThemeStyle } from "@/lib/theme";
import type { ReservationDTO } from "@/lib/types";
import { CrownIcon } from "@/components/icons/Crown";
import { AccountsList } from "@/components/AccountsList";
import { PayerNameInput, payerNameError } from "@/components/PayerNameInput";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Spinner } from "@/components/Spinner";

const REFRESH_MS = 30_000;

const STATE_TEXT: Record<ReservationDTO["state"], { title: string; tone: string }> = {
  pending: { title: "Pendiente de pago", tone: "border-gold-600/50 bg-gold-400/10 text-gold-400" },
  review: { title: "Comprobante en revisión", tone: "border-gold-600/50 bg-gold-400/10 text-gold-400" },
  rejected: { title: "Comprobante rechazado", tone: "border-red-500/40 bg-red-500/10 text-red-400" },
  paid: { title: "Pago confirmado", tone: "border-green-500/40 bg-green-500/10 text-green-400" },
};

/**
 * "Mi reserva": what a buyer reserved from the public link and what happened with their payment, with
 * the accounts to pay and a place to (re)send the receipt. Refreshes itself so a confirmation shows up
 * without reloading.
 */
export function ReservationView({
  token,
  reservationKey,
  initial,
}: {
  token: string;
  reservationKey: string;
  initial: ReservationDTO | null;
}) {
  const [r, setR] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/raffles/${token}/reservation/${reservationKey}`, { cache: "no-store" });
      if (res.status === 404) setR(null);
      else if (res.ok) setR((await res.json()) as ReservationDTO);
    } catch {
      // Offline: keep what is on screen.
    }
  }, [token, reservationKey]);

  useEffect(() => {
    // Opened from the email on another device: remember it here too.
    if (initial) rememberReservation(token, reservationKey);
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, initial, token, reservationKey]);

  return (
    <div
      className="flex min-h-dvh flex-1 flex-col pb-12"
      style={r ? pageThemeStyle({ background: r.themeBackground, numberColor: r.themeNumberColor }) : undefined}
    >
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-safe">
        <div className="flex items-center justify-center gap-2 py-5">
          <CrownIcon className="h-5 w-8 text-gold-400" />
          <span className="font-[family-name:var(--font-heading)] text-lg font-bold text-gold-400">Ibirifas</span>
        </div>

        {!r ? (
          <div className="rounded-2xl border border-line bg-bg-elevated p-6 text-center shadow-card">
            <h1 className="font-[family-name:var(--font-heading)] text-xl font-bold text-text">Esta reserva ya no está activa</h1>
            <p className="mt-2 text-sm text-text-muted">
              Puede que se haya liberado por falta de pago o que el enlace no sea correcto. Si ya pagaste, escríbele a quien
              organiza la rifa.
            </p>
            <Link href={`/p/${token}`} className="mt-4 inline-block text-sm font-semibold text-gold-400 underline-offset-2 hover:underline">
              Ver la rifa
            </Link>
          </div>
        ) : (
          <Details token={token} reservationKey={reservationKey} r={r} onChanged={refresh} />
        )}
      </main>
    </div>
  );
}

function Details({
  token,
  reservationKey,
  r,
  onChanged,
}: {
  token: string;
  reservationKey: string;
  r: ReservationDTO;
  onChanged: () => Promise<void>;
}) {
  const state = STATE_TEXT[r.state];
  const items = [...r.sets.map((s) => `Conjunto ${s.label}`), ...r.numbers.map(formatNumberValue)];
  const canSend = r.state !== "paid" && !r.raffleClosed;
  const st = r.stages;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-sm text-text-muted">Mi reserva{r.buyerName ? ` · ${r.buyerName}` : ""}</p>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-extrabold leading-tight text-text">{r.raffleName}</h1>
      </div>

      <div role="status" className={`rounded-2xl border p-4 ${state.tone}`}>
        <p className="font-[family-name:var(--font-heading)] text-lg font-bold">
          {st && r.state !== "paid" && st.paid > 0 ? `${st.paid} de ${st.total} cuotas pagadas` : state.title}
        </p>
        <p className="mt-1 text-sm text-text">
          {r.state === "paid"
            ? "¡Listo! Tu pago fue confirmado. Mucha suerte."
            : r.state === "review"
              ? "Recibimos tu comprobante. Quien organiza la rifa lo revisará y aquí verás cuando lo confirme."
              : r.state === "rejected"
                ? `No pudieron aprobar el comprobante que enviaste.${r.rejectReason ? ` Motivo: ${r.rejectReason}.` : ""} Puedes subir uno nuevo abajo.`
                : st && st.paid > 0
                  ? st.dueNow > 0
                    ? `Para jugar ${st.nextStage ?? "el próximo sorteo"} paga ${formatCurrency(st.dueNow)}${st.lastDay ? ` hasta el ${st.lastDay}` : ""}.`
                    : `Estás al día${st.nextStage ? ` para ${st.nextStage}` : ""}.`
                  : "Paga y sube aquí la foto del comprobante."}
        </p>
        {r.deadline && r.state !== "paid" && (
          <p className="mt-1 text-xs text-text-muted">Si no se paga, la reserva se libera el {formatDate(r.deadline)}.</p>
        )}
        {r.hasEmail && r.state !== "paid" && (
          <p className="mt-1 text-xs text-text-muted">También te avisaremos por correo.</p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-bg-elevated p-4 shadow-card">
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className={`flex h-10 min-w-10 items-center justify-center rounded-xl px-2.5 font-[family-name:var(--font-heading)] text-base font-bold ${
                r.state === "paid"
                  ? "bg-gradient-to-b from-green-400 to-green-600 text-[#052012]"
                  : "bg-gradient-to-b from-gold-300 to-gold-500 text-on-accent"
              }`}
            >
              {item}
            </span>
          ))}
        </div>
        <p className="mt-3 flex justify-between text-sm text-text">
          <span className="text-text-muted">Total</span>
          <span className="font-semibold">{formatCurrency(r.total)}</span>
        </p>
        {st && (
          <>
            <p className="flex justify-between text-sm text-text">
              <span className="text-text-muted">Pagado</span>
              <span className="font-semibold">{formatCurrency(st.paidAmount)}</span>
            </p>
            {st.owed > 0 && (
              <p className="flex justify-between text-sm text-text">
                <span className="text-text-muted">Falta</span>
                <span className="font-semibold">{formatCurrency(st.owed)}</span>
              </p>
            )}
          </>
        )}
      </div>

      {r.state !== "paid" && r.accounts.length > 0 && (
        <div className="space-y-1 rounded-2xl border border-line bg-bg-elevated p-4 text-sm text-text-muted shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-wide">Paga aquí</p>
          <AccountsList accounts={r.accounts} token={token} />
        </div>
      )}

      {canSend && (
        <SendReceipt token={token} reservationKey={reservationKey} buyerName={r.buyerName} replacing={r.state === "review"} onSent={onChanged} />
      )}

      <Link href={`/p/${token}`} className="block text-center text-sm font-semibold text-gold-400 underline-offset-2 hover:underline">
        Ver la rifa
      </Link>
    </div>
  );
}

function SendReceipt({
  token,
  reservationKey,
  buyerName,
  replacing,
  onSent,
}: {
  token: string;
  reservationKey: string;
  buyerName: string | null;
  replacing: boolean;
  onSent: () => Promise<void>;
}) {
  const [receipt, setReceipt] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [payerName, setPayerName] = useState(buyerName ?? "");

  const send = async () => {
    if (!receipt) return;
    const payerProblem = payerNameError(payerName);
    if (payerProblem) return setError(payerProblem);
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/raffles/${token}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: reservationKey, photoDataUrl: receipt, payerName: payerName.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "No se pudo enviar el comprobante. Inténtalo de nuevo.");
        return;
      }
      setSent(true);
      setReceipt(null);
      await onSent();
    } catch {
      setError("No se pudo enviar el comprobante. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-line bg-bg-elevated p-4 shadow-card">
      {sent && (
        <p role="status" className="text-sm font-semibold text-green-400">
          ✓ Comprobante enviado.
        </p>
      )}
      <p className="text-sm font-semibold text-text">{replacing ? "¿Te equivocaste de foto? Envía otra" : "Sube tu comprobante de pago"}</p>
      <PhotoPicker
        label="Foto o captura del pago"
        source="any"
        value={receipt}
        onChange={setReceipt}
        onError={setError}
        onBusyChange={setPreparing}
      />
      {receipt && <PayerNameInput id="reservationPayerName" value={payerName} onChange={setPayerName} />}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-400">
          {error}
        </p>
      )}
      {receipt && (
        <button
          type="button"
          onClick={send}
          disabled={sending || preparing}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-bold text-on-accent shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? (
            <>
              <Spinner size={18} />
              Enviando…
            </>
          ) : (
            "Enviar comprobante"
          )}
        </button>
      )}
    </div>
  );
}
