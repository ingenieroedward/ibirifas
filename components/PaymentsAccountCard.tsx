"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  connectPaymentsAccount,
  disconnectPaymentsAccount,
  getPaymentsAccount,
  updateOrgSettings,
  updatePaymentsAccount,
} from "@/lib/api-client";
import type { PaymentsAccountDTO } from "@/lib/types";
import { CopyButton } from "@/components/CopyButton";
import { Spinner } from "@/components/Spinner";

const BANKS = [
  { id: "nequi_negocios", label: "Nequi Negocios" },
  { id: "nequi", label: "Nequi" },
  { id: "bancolombia", label: "Bancolombia" },
] as const;

const dt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });

type Notify = (message: string, variant?: "success" | "error" | "info") => void;

/**
 * Mi equipo → "Pagos Bre-B automáticos": the organizer connects the account their buyers pay to. pagoradar
 * gives it a forwarding address; the organizer's Gmail forwards the bank's notices there (with the code
 * Gmail asks for shown right here), and from then on payments are matched to reservations by themselves.
 */
export function PaymentsAccountCard({ onNotify, defaultEmail }: { onNotify: Notify; defaultEmail: string | null }) {
  const [state, setState] = useState<PaymentsAccountDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [banks, setBanks] = useState<string[]>(["nequi_negocios", "nequi", "bancolombia"]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await getPaymentsAccount());
    } catch {
      // Not an organizer, or offline: the card stays hidden.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPaymentsAccount()
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // While the account waits for Gmail's code or the first notice, check every 10 s.
  const waiting = state?.account?.status === "pending";
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [waiting, load]);

  if (!state || (!state.available && !state.legacy)) return null;

  const run = async (fn: () => Promise<PaymentsAccountDTO>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
      setEditing(false);
      if (done) onNotify(done, "success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const validForm = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && banks.length > 0;

  const toggleAuto = async (next: boolean) => {
    const previous = state;
    setState({ ...state, autoApprove: next });
    try {
      await updateOrgSettings({ autoApprovePayments: next });
    } catch {
      setState(previous);
      onNotify("No se pudo guardar el cambio. Inténtalo de nuevo.", "error");
    }
  };

  const form = (submitLabel: string, onSubmit: () => void) => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="payOwnerEmail" className="text-sm font-medium text-text-muted">
          Gmail donde tu banco te avisa los pagos
        </label>
        <input
          id="payOwnerEmail"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu-correo@gmail.com"
          maxLength={120}
          className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-base text-text outline-none focus:border-gold-400"
        />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-text-muted">Bancos</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {BANKS.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={banks.includes(b.id)}
                onChange={(e) => setBanks((cur) => (e.target.checked ? [...cur, b.id] : cur.filter((x) => x !== b.id)))}
                className="h-4 w-4 accent-[#f5c542]"
              />
              {b.label}
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-400">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || !validForm}
        className="flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-bold text-[#241a02] transition active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? <Spinner size={16} /> : submitLabel}
      </button>
    </div>
  );

  const a = state.account;
  return (
    <section className="mb-4 space-y-4 rounded-2xl border border-line bg-bg-elevated p-4 shadow-card" aria-label="Pagos Bre-B automáticos">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">Pagos Bre-B automáticos</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Cuando tu banco te avisa un pago por correo, la app lo cruza con la reserva (valor, titular y hora) y lo aprueba sola.
          </p>
        </div>
        {a ? (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              a.status === "active" ? "bg-green-500/15 text-green-400" : a.status === "disabled" ? "bg-surface-2 text-text-muted" : "bg-gold-400/15 text-gold-400"
            }`}
          >
            {a.status === "active" ? "Conectado" : a.status === "disabled" ? "Pausado" : "Falta un paso"}
          </span>
        ) : state.legacy ? (
          <span className="shrink-0 rounded-full bg-green-500/15 px-2.5 py-1 text-[11px] font-bold text-green-400">Conectado</span>
        ) : null}
      </div>

      {state.unreachable && <p className="text-sm text-gold-400">No se pudo consultar el lector de pagos ahora mismo. Vuelve a intentarlo en un momento.</p>}

      {!a && !state.unreachable && state.available && (
        <>
          {state.legacy && (
            <p className="text-xs text-text-muted">
              Hoy recibes los pagos por la configuración del servidor. Puedes conectar aquí tu propia cuenta (por ejemplo, otra cuenta de Nequi).
            </p>
          )}
          {form("Conectar mi cuenta", () => void run(() => connectPaymentsAccount(email.trim(), banks), "Cuenta creada: sigue los pasos para terminar."))}
        </>
      )}

      {a && !editing && (
        <>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-text">
            <li>
              En <b>{a.ownerEmails.join(", ")}</b>: Gmail → ⚙️ <b>Ver toda la configuración</b> → <b>Reenvío y correo POP/IMAP</b> →{" "}
              <b>Agregar una dirección de reenvío</b>:
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all rounded-lg bg-surface-2 px-2 py-1 text-xs">{a.address}</code>
                <CopyButton text={a.address} label="dirección de reenvío" />
              </span>
            </li>
            <li>
              Gmail te pide un código de confirmación; aparece aquí:
              {a.confirmationCode || a.confirmationLink ? (
                <span className="mt-1 block rounded-xl border border-dashed border-gold-600/60 bg-gold-400/10 p-3">
                  {a.confirmationCode && (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-[family-name:var(--font-heading)] text-xl font-extrabold tracking-wider text-gold-400">{a.confirmationCode}</span>
                      <CopyButton text={a.confirmationCode} label="código de Gmail" />
                    </span>
                  )}
                  {a.confirmationLink && (
                    <a href={a.confirmationLink} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs font-semibold text-gold-400 underline">
                      O confírmalo con este enlace (con tu Gmail abierto)
                    </a>
                  )}
                  {a.confirmationAt && <span className="mt-1 block text-[11px] text-text-muted">Recibido {dt.format(new Date(a.confirmationAt))}</span>}
                </span>
              ) : (
                <span className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                  <Spinner size={14} /> Esperando el correo de Gmail…
                </span>
              )}
              <span className="mt-1 block text-xs text-text-muted">Deja marcado &quot;Inhabilitar reenvío&quot;: solo se reenvía con el filtro del paso 3.</span>
            </li>
            <li>
              Crea un filtro: en el buscador de Gmail → opciones → en <b>De</b> pega:
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all rounded-lg bg-surface-2 px-2 py-1 text-xs">{a.gmailFilterFrom}</code>
                <CopyButton text={a.gmailFilterFrom} label="remitentes del banco" />
              </span>
              <span className="mt-1 block">
                → <b>Crear filtro</b> → <b>Reenviarlo a</b> la dirección del paso 1.
              </span>
            </li>
            <li>
              {a.status === "active" ? (
                <span className="text-green-400">
                  ✓ Recibiendo avisos{a.lastPaymentAt ? ` · último pago ${dt.format(new Date(a.lastPaymentAt))}` : ""}.
                </span>
              ) : (
                "Haz un pago pequeño de prueba a tu cuenta: con el primer aviso queda conectado."
              )}
            </li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setEmail(a.ownerEmails[0] ?? "");
                setBanks(a.banks);
                setEditing(true);
              }}
              className="h-10 flex-1 rounded-xl border border-line px-3 text-sm font-semibold text-text transition active:scale-[0.98]"
            >
              Cambiar correo o bancos
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm("¿Desconectar? Los pagos dejarán de cruzarse solos. Recuerda quitar el filtro de reenvío en Gmail.")) {
                  void run(() => disconnectPaymentsAccount(), "Cuenta desconectada.");
                }
              }}
              className="h-10 flex-1 rounded-xl border border-line px-3 text-sm font-semibold text-red-400 transition active:scale-[0.98] disabled:opacity-50"
            >
              Desconectar
            </button>
          </div>
        </>
      )}

      {a && editing && (
        <>
          {form("Guardar", () => void run(() => updatePaymentsAccount(email.trim(), banks), "Guardado."))}
          <button type="button" onClick={() => setEditing(false)} className="w-full text-center text-sm font-semibold text-text-muted">
            Cancelar
          </button>
        </>
      )}

      {(a || state.legacy) && (
        <div className="space-y-3 border-t border-line pt-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              id="autoApprovePayments"
              type="checkbox"
              checked={state.autoApprove}
              onChange={(e) => void toggleAuto(e.target.checked)}
              className="mt-1 h-5 w-5 accent-[#f5c542]"
            />
            <span>
              <span className="block text-sm font-semibold text-text">Aprobar solos los pagos</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                Si un pago coincide con una sola reserva en línea (mismo valor, el titular que escribió el comprador y hecho después de
                reservar) se marca pagado y te llega un aviso; se puede deshacer. Apagado, cada pago espera en &quot;Pagos recibidos&quot;.
              </span>
            </span>
          </label>
          <Link href="/pagos" className="inline-block text-sm font-semibold text-gold-400 underline-offset-2 hover:underline">
            Ver pagos recibidos
          </Link>
        </div>
      )}
    </section>
  );
}
