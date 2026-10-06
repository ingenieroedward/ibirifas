"use client";

import { useCallback, useEffect, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";
import { CheckIcon, TrophyIcon } from "@/components/icons/LineIcons";
import { CopyButton } from "@/components/CopyButton";
import { activateRaffle, ApiError, getActivation, sendPackReceipt } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { fileToCompressedDataUrl } from "@/lib/image";
import type { ActivationStateDTO } from "@/lib/types";

type PackId = ActivationStateDTO["packs"][number]["id"];

interface ActivationSheetProps {
  raffleId: string;
  raffleName: string;
  totalNumbers: number;
  orgCode: string | null;
  isOrganizer: boolean;
  onClose: () => void;
  /** The raffle became active (free, credit, or the payment was confirmed). */
  onActivated: () => void;
}

const POLL_MS = 5_000;
/** A receipt waits for a person to look at it: no need to ask as often. */
const RECEIPT_POLL_MS = 20_000;

/**
 * Activating a raffle so it can sell (lib/billing.ts): with the free first raffle, a credit, or buying a pack of
 * raffles (this one takes one, the rest stay as credits), online through pagoradar or by transfer to the platform
 * owner's Bre-B key with a receipt the superadmin reviews. While a payment or a receipt is under way it keeps
 * asking, so the sheet turns into "¡Activada!" by itself once it's confirmed.
 */
export function ActivationSheet({ raffleId, raffleName, totalNumbers, orgCode, isOrganizer, onClose, onActivated }: ActivationSheetProps) {
  const [state, setState] = useState<ActivationStateDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickedPack, setPickedPack] = useState<PackId | null>(null);
  const [manualPicked, setManualPicked] = useState<boolean | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [payerName, setPayerName] = useState("");
  const [resend, setResend] = useState(false);

  const apply = useCallback(
    (next: ActivationStateDTO) => {
      setState(next);
      if (next.active) onActivated();
    },
    [onActivated],
  );

  useEffect(() => {
    let cancelled = false;
    getActivation(raffleId)
      .then((s) => !cancelled && apply(s))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "No se pudo cargar. Revisa tu conexión."));
    return () => {
      cancelled = true;
    };
  }, [raffleId, apply]);

  // A payment or a receipt under way: check now and then until it's confirmed.
  const waitEvery = !state || state.active ? null : state.checkoutUrl ? POLL_MS : state.receipt?.status === "pending" ? RECEIPT_POLL_MS : null;
  useEffect(() => {
    if (!waitEvery) return;
    const timer = setInterval(() => {
      getActivation(raffleId).then(apply).catch(() => {});
    }, waitEvery);
    return () => clearInterval(timer);
  }, [waitEvery, raffleId, apply]);

  const pickReceipt = (file: File | null) => {
    setReceiptFile(file);
    setReceiptPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const pack: PackId = pickedPack ?? state?.pendingPack ?? state?.receipt?.pack ?? "small";
  // Paying by transfer + receipt: the only way without online payment, or the organizer's choice next to it.
  const manual = Boolean(state?.breb) && (!state?.payOnline || (manualPicked ?? Boolean(state?.receipt)));
  const chosen = state?.packs.find((p) => p.id === pack) ?? state?.packs[0];

  const run = async (action: "allowance" | "pay") => {
    setBusy(true);
    setError(null);
    try {
      const next = await activateRaffle(raffleId, action, action === "pay" ? pack : undefined);
      apply(next);
      if (action === "pay" && next.checkoutUrl && !next.active) window.location.assign(next.checkoutUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar. Revisa tu conexión.");
    } finally {
      setBusy(false);
    }
  };

  const submitReceipt = async () => {
    if (!receiptFile) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await fileToCompressedDataUrl(receiptFile, { maxSize: 1400, quality: 0.75 });
      apply(await sendPackReceipt(raffleId, pack, photo, payerName.trim()));
      pickReceipt(null);
      setResend(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el comprobante. Revisa tu conexión.");
    } finally {
      setBusy(false);
    }
  };

  const org = orgCode ? `, organización ${orgCode}` : "";
  const whatsappText = encodeURIComponent(
    `Hola, quiero el paquete de ${chosen?.raffles ?? ""} rifas para activar mi rifa «${raffleName}» (${totalNumbers} números)${org}.`,
  );
  const dealText = encodeURIComponent(`Hola, necesito más rifas para mi organización${org}. ¿Qué plan me ofrecen?`);
  const smallest = state?.packs[0];

  return (
    <BottomSheet title={state?.active ? "¡Rifa activada!" : "Activar la rifa"} subtitle={raffleName} onClose={busy ? () => {} : onClose}>
      {!state && !error && (
        <div className="flex justify-center py-8">
          <Spinner size={28} className="text-gold-400" />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {state?.active && (
        <div className="space-y-3 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold-600/40 bg-gold-400/10 text-gold-400">
            <TrophyIcon className="h-7 w-7" />
          </span>
          <p className="text-sm text-text">Ya puedes vender números y compartir el enlace de la rifa.</p>
          <button type="button" onClick={onClose} className={PRIMARY}>
            Empezar a vender
          </button>
        </div>
      )}

      {state && !state.active && !isOrganizer && (
        <p className="text-sm text-text-muted">
          Esta rifa todavía no está activa. Pídele al organizador que la active para empezar a vender.
        </p>
      )}

      {state && !state.active && isOrganizer && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            La rifa ya está creada y la puedes preparar. Para vender números y compartir el enlace, actívala.
          </p>

          {state.option === "free" && (
            <>
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                <p className="font-semibold text-emerald-300">Tu primera rifa es gratis</p>
                <p className="mt-0.5 text-sm text-emerald-200/80">Con todo incluido, para que pruebes Ibirifas.</p>
              </div>
              <button type="button" onClick={() => void run("allowance")} disabled={busy} className={PRIMARY}>
                {busy ? <Spinner size={18} /> : "Activar gratis"}
              </button>
            </>
          )}

          {state.option === "credit" && (
            <>
              <div className="rounded-2xl border border-gold-600/40 bg-gold-400/10 p-4">
                <p className="font-semibold text-gold-400">
                  Tienes {state.credits} {state.credits === 1 ? "rifa" : "rifas"} de saldo
                </p>
                <p className="mt-0.5 text-sm text-text-muted">Activar esta rifa usa 1.</p>
              </div>
              <button type="button" onClick={() => void run("allowance")} disabled={busy} className={PRIMARY}>
                {busy ? <Spinner size={18} /> : "Activar con mi saldo"}
              </button>
            </>
          )}

          {state.option === "pay" && chosen && (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Elige un paquete de rifas</legend>
                {state.packs.map((p) => {
                  const on = p.id === pack;
                  const each = Math.round(p.price / p.raffles);
                  const saves = smallest && p.id !== smallest.id ? Math.round((1 - each / (smallest.price / smallest.raffles)) * 100) : 0;
                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${
                        on ? "border-gold-500 bg-gold-400/10" : "border-line bg-surface-2/60 hover:border-gold-600/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="pack"
                        value={p.id}
                        checked={on}
                        onChange={() => setPickedPack(p.id)}
                        disabled={busy}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-gold-400 bg-gold-400 text-[#241a02]" : "border-line"}`}
                      >
                        {on && <CheckIcon className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-semibold text-text">
                          {p.raffles} rifas
                          {saves > 0 && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">Ahorras {saves}%</span>
                          )}
                        </span>
                        <span className="block text-xs text-text-muted">{formatCurrency(each)} por rifa</span>
                      </span>
                      <span className="font-[family-name:var(--font-heading)] text-xl font-extrabold text-gold-400">{formatCurrency(p.price)}</span>
                    </label>
                  );
                })}
              </fieldset>
              <p className="text-xs text-text-muted">
                Esta rifa usa 1 y las demás quedan de saldo para tus próximas rifas, de cualquier tamaño. El saldo no vence y no
                cobramos comisión de tus ventas.
              </p>

              {manual && state.breb ? (
                <TransferReceipt
                  breb={state.breb}
                  price={chosen.price}
                  receipt={state.receipt}
                  resend={resend}
                  onResend={() => setResend(true)}
                  payerName={payerName}
                  onPayerName={setPayerName}
                  preview={receiptPreview}
                  onFile={pickReceipt}
                  busy={busy}
                  onSubmit={() => void submitReceipt()}
                />
              ) : state.payOnline ? (
                <>
                  {state.checkoutUrl && state.pendingPack === pack && (
                    <p role="status" className="flex items-center gap-2 text-sm text-gold-400">
                      <Spinner size={14} /> Esperando la confirmación del pago… se activa sola.
                    </p>
                  )}
                  <button type="button" onClick={() => void run("pay")} disabled={busy} className={PRIMARY}>
                    {busy ? (
                      <Spinner size={18} />
                    ) : state.checkoutUrl && state.pendingPack === pack ? (
                      "Continuar el pago"
                    ) : (
                      `Pagar ${formatCurrency(chosen.price)} con Bre-B`
                    )}
                  </button>
                  <p className="text-center text-xs text-text-muted">
                    Pagas desde la app de tu banco con llave Bre-B y la rifa se activa sola en uno o dos minutos.
                  </p>
                </>
              ) : state.whatsapp ? (
                <>
                  <a
                    href={`https://wa.me/${state.whatsapp}?text=${whatsappText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={WHATSAPP}
                  >
                    Pedir el paquete por WhatsApp
                  </a>
                  <p className="text-center text-xs text-text-muted">Te decimos cómo pagar y, al confirmarlo, activamos la rifa.</p>
                </>
              ) : (
                <p className="text-sm text-text-muted">Comunícate con quien te dio acceso a Ibirifas para activarla.</p>
              )}

              {state.payOnline && state.breb && (
                <button
                  type="button"
                  onClick={() => setManualPicked(!manual)}
                  disabled={busy}
                  className="block w-full text-center text-xs font-semibold text-gold-400 underline-offset-2 hover:underline"
                >
                  {manual ? "Prefiero pagar en línea" : "Prefiero transferir y subir el comprobante"}
                </button>
              )}

              {state.whatsapp && (
                <p className="text-center text-xs text-text-muted">
                  ¿Necesitas más rifas?{" "}
                  <a
                    href={`https://wa.me/${state.whatsapp}?text=${dealText}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-gold-400 underline-offset-2 hover:underline"
                  >
                    Hablemos de un plan a convenir
                  </a>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

/** Paying a pack by transfer: where to send it, then the photo of the receipt (or how the one sent is going). */
function TransferReceipt({
  breb,
  price,
  receipt,
  resend,
  onResend,
  payerName,
  onPayerName,
  preview,
  onFile,
  busy,
  onSubmit,
}: {
  breb: NonNullable<ActivationStateDTO["breb"]>;
  price: number;
  receipt: ActivationStateDTO["receipt"];
  resend: boolean;
  onResend: () => void;
  payerName: string;
  onPayerName: (v: string) => void;
  preview: string | null;
  onFile: (f: File | null) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  if (receipt?.status === "pending" && !resend) {
    return (
      <div className="space-y-3">
        <div role="status" className="rounded-2xl border border-gold-600/40 bg-gold-400/10 p-4">
          <p className="flex items-center gap-2 font-semibold text-gold-400">
            <Spinner size={14} /> Comprobante en revisión
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Enviado el {formatDate(receipt.sentAt)}: paquete de {receipt.raffles} rifas por {formatCurrency(receipt.amount)}. Cuando lo
            aprobemos, la rifa se activa sola y te llega un aviso.
          </p>
        </div>
        <button type="button" onClick={onResend} className="block w-full text-center text-xs font-semibold text-gold-400 underline-offset-2 hover:underline">
          Enviar otro comprobante
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {receipt?.status === "rejected" && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          No aprobamos el comprobante anterior{receipt.reason ? `: ${receipt.reason}` : "."} Envía otro, por favor.
        </p>
      )}
      <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">1. Transfiere {formatCurrency(price)} a la llave Bre-B</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="min-w-0 break-all font-[family-name:var(--font-heading)] text-xl font-extrabold text-text">{breb.key}</p>
          <CopyButton text={breb.key} label="la llave Bre-B" />
        </div>
        {breb.holder && <p className="mt-1 text-xs text-text-muted">A nombre de {breb.holder}</p>}
      </div>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">2. ¿A nombre de quién salió el pago?</span>
        <input
          type="text"
          value={payerName}
          onChange={(e) => onPayerName(e.target.value)}
          maxLength={80}
          placeholder="Como aparece en tu banco (opcional)"
          disabled={busy}
          className="mt-1.5 h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base text-text placeholder:text-text-muted focus:border-gold-500 focus:outline-none"
        />
      </label>
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">3. Sube la foto o captura del comprobante</span>
        <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-gold-600/50 p-3 hover:bg-gold-400/5">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Comprobante elegido" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-2xl text-gold-400">+</span>
          )}
          <span className="text-sm text-text">{preview ? "Cambiar la imagen" : "Elegir imagen"}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Comprobante de pago"
            disabled={busy}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </label>
      </div>
      <button type="button" onClick={onSubmit} disabled={busy || !preview} className={PRIMARY}>
        {busy ? <Spinner size={18} /> : "Enviar comprobante"}
      </button>
      <p className="text-center text-xs text-text-muted">Lo revisamos y, al aprobarlo, la rifa se activa sola.</p>
    </div>
  );
}

const PRIMARY =
  "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

const WHATSAPP =
  "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#25d366] text-base font-bold text-[#062b14] transition active:scale-[0.98]";
