"use client";

import { useState, type ReactNode } from "react";
import type { PaymentMethod, QuotaAction, RaffleNumberDTO, UpdateNumberInput } from "@/lib/types";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/payment";
import { amountRemaining, type StageSettings } from "@/lib/stages";
import { PhotoPicker } from "@/components/PhotoPicker";
import { QuotaPanel } from "@/components/QuotaPanel";
import { ReceiptReview } from "@/components/ReceiptReview";
import { Spinner } from "@/components/Spinner";

interface NumberSheetProps {
  number: RaffleNumberDTO | null;
  numberPrice: number;
  /** Names already used in this raffle, offered as suggestions so one buyer isn't typed two ways. */
  knownBuyers?: string[];
  /** False once the raffle is closed: numbers can no longer be freed. */
  canRelease?: boolean;
  onClose: () => void;
  onSave: (id: string, input: UpdateNumberInput) => Promise<void>;
  /** A raffle by stages: the number is paid in installments instead of "Marcar como pagado". */
  stageSettings?: StageSettings | null;
  onQuotas?: (id: string, action: QuotaAction, method: PaymentMethod) => Promise<void>;
  /** Reject the receipt a buyer sent (it is removed; they are told why). */
  onRejectReceipt?: (id: string, reason: string | null) => Promise<void>;
}

const STATUS_LABEL: Record<RaffleNumberDTO["status"], string> = {
  available: "Disponible",
  occupied: "Ocupado",
  paid: "Pagado",
};

export function NumberSheet({
  number,
  numberPrice,
  knownBuyers = [],
  canRelease = true,
  onClose,
  onSave,
  stageSettings = null,
  onQuotas,
  onRejectReceipt,
}: NumberSheetProps) {
  if (!number) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm"
      />
      <SheetContent
        key={number.id}
        number={number}
        numberPrice={numberPrice}
        knownBuyers={knownBuyers}
        canRelease={canRelease}
        onClose={onClose}
        onSave={onSave}
        stageSettings={stageSettings}
        onQuotas={onQuotas}
        onRejectReceipt={onRejectReceipt}
      />
    </div>
  );
}

function SheetContent({
  number,
  numberPrice,
  knownBuyers,
  canRelease,
  onClose,
  onSave,
  stageSettings,
  onQuotas,
  onRejectReceipt,
}: {
  number: RaffleNumberDTO;
  numberPrice: number;
  knownBuyers: string[];
  canRelease: boolean;
  onClose: () => void;
  onSave: (id: string, input: UpdateNumberInput) => Promise<void>;
  stageSettings: StageSettings | null;
  onQuotas?: (id: string, action: QuotaAction, method: PaymentMethod) => Promise<void>;
  onRejectReceipt?: (id: string, reason: string | null) => Promise<void>;
}) {
  const [buyerName, setBuyerName] = useState(number.buyerName ?? "");
  const [buyerPhone, setBuyerPhone] = useState(number.buyerPhone ?? "");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(number.photoDataUrl);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    (number.paymentMethod as PaymentMethod | null) ?? "cash",
  );

  const isAvailable = number.status === "available";
  // A sold number shows the receipt as it is now (the buyer may send or replace it while the sheet is open).
  const shownPhoto = isAvailable ? photoDataUrl : number.photoDataUrl;

  const handleSell = async () => {
    const trimmedName = buyerName.trim();
    if (!trimmedName) {
      setFormError("El nombre del comprador es obligatorio.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSave(number.id, {
        status: "occupied",
        buyerName: trimmedName,
        buyerPhone: buyerPhone.trim() || null,
        photoDataUrl,
        // Selling from the "available" form: refuse if someone took it first.
        expectAvailable: number.status === "available",
      });
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const handleMarkPaid = async () => {
    setSaving(true);
    try {
      await onSave(number.id, {
        status: "paid",
        buyerName: number.buyerName,
        buyerPhone: number.buyerPhone,
        photoDataUrl: number.photoDataUrl,
        notes: number.notes,
        paymentMethod,
      });
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const handleRelease = async () => {
    setSaving(true);
    try {
      await onSave(number.id, {
        status: "available",
        buyerName: null,
        buyerPhone: null,
        photoDataUrl: null,
        notes: null,
      });
      onClose();
    } catch {
      setSaving(false);
      setConfirmingRelease(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Número ${formatNumberValue(number.value)}`}
      onClick={(e) => e.stopPropagation()}
      className="relative z-10 max-h-[92dvh] w-full animate-sheet-up overflow-y-auto scrollbar-thin rounded-t-3xl border-t border-line bg-surface pb-safe shadow-card sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl sm:border"
    >
      <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-line" />

      <div className="flex items-start justify-between px-5 pt-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl font-[family-name:var(--font-heading)] text-lg font-bold ${
              number.status === "available"
                ? "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02]"
                : number.status === "paid"
                  ? "bg-gradient-to-b from-green-400 to-green-600 text-[#052012]"
                  : "border border-line bg-surface-2 text-text"
            }`}
          >
            {formatNumberValue(number.value)}
          </div>
          <div>
            <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
              Número {formatNumberValue(number.value)}
            </p>
            <p className="text-sm text-text-muted">
              {STATUS_LABEL[number.status]} · {formatCurrency(numberPrice)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-text-muted transition active:scale-90"
        >
          ✕
        </button>
      </div>

      <div className="space-y-5 px-5 py-5">
        {isAvailable ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor="buyerName" className="text-sm font-medium text-text-muted">
                Nombre del comprador <span className="text-gold-400">*</span>
              </label>
              <input
                id="buyerName"
                type="text"
                list="known-buyers-single"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Ej. María Pérez"
                autoComplete="off"
                className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400"
              />
              <datalist id="known-buyers-single">
                {knownBuyers.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="buyerPhone" className="text-sm font-medium text-text-muted">
                Teléfono (opcional)
              </label>
              <input
                id="buyerPhone"
                type="tel"
                inputMode="tel"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="Ej. 3001234567"
                autoComplete="tel"
                className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400"
              />
            </div>

            <PhotoPicker
              value={photoDataUrl}
              onChange={(url) => {
                setPhotoDataUrl(url);
                setFormError(null);
              }}
              onError={setFormError}
              onBusyChange={setProcessingPhoto}
            />

            {formError && <p className="text-sm font-medium text-red-400">{formError}</p>}

            <button
              type="button"
              onClick={handleSell}
              disabled={saving || processingPhoto || buyerName.trim().length === 0}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? (
                <>
                  <Spinner size={20} />
                  Guardando…
                </>
              ) : (
                "Guardar"
              )}
            </button>
          </>
        ) : (
          <>
            <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
              <InfoRow label="Comprador" value={number.buyerName || "Sin nombre"} />
              {number.online && <InfoRow label="Origen" value="Reserva en línea" />}
              {number.buyerEmail && (
                <InfoRow
                  label="Correo"
                  value={
                    <a href={`mailto:${number.buyerEmail}`} className="break-all text-gold-400 underline-offset-2 hover:underline">
                      {number.buyerEmail}
                    </a>
                  }
                />
              )}
              {number.updatedByName && (
                <InfoRow label="Registrado por" value={number.updatedByName} />
              )}
              {number.buyerPhone && (
                <InfoRow
                  label="Teléfono"
                  value={
                    <a href={`tel:${number.buyerPhone}`} className="text-gold-400 underline-offset-2 hover:underline">
                      {number.buyerPhone}
                    </a>
                  }
                />
              )}
              <InfoRow
                label="Pago"
                value={
                  stageSettings
                    ? number.status === "paid"
                      ? "Pagado completo"
                      : `Debe ${formatCurrency(amountRemaining(number.quotas, stageSettings.stages))}`
                    : number.status === "paid"
                    ? number.paymentMethod
                      ? `Pagado · ${PAYMENT_METHOD_LABEL[number.paymentMethod]}`
                      : "Pagado"
                    : "Pendiente"
                }
              />
            </div>

            {shownPhoto && (
              <button
                type="button"
                onClick={() => setPhotoViewerOpen(true)}
                className="block h-48 w-full overflow-hidden rounded-2xl border border-line"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shownPhoto} alt="Comprobante" className="h-full w-full object-cover" />
              </button>
            )}

            {!isAvailable && number.payerName && (
              <p className="text-sm text-text-muted">
                Titular que pagó: <span className="font-semibold text-text">{!isAvailable && number.payerName}</span>
              </p>
            )}

            {number.status === "occupied" && onRejectReceipt && (
              <ReceiptReview
                hasReceipt={Boolean(number.photoDataUrl)}
                rejectedAt={number.receiptRejectedAt}
                rejectReason={number.receiptRejectReason}
                buyerEmail={number.buyerEmail}
                onReject={(reason) => onRejectReceipt(number.id, reason)}
              />
            )}

            {formError && <p className="text-sm font-medium text-red-400">{formError}</p>}

            {stageSettings && onQuotas && (
              <QuotaPanel
                number={number}
                settings={stageSettings}
                canCollect
                onQuotas={(action, method) => onQuotas(number.id, action, method)}
              />
            )}

            <div className="space-y-2.5">
              {number.status === "occupied" && !stageSettings && (
                <>
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium text-text-muted">Método de pago</span>
                    <div className="grid grid-cols-4 gap-2">
                      {PAYMENT_METHODS.map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          disabled={saving}
                          className={`h-11 rounded-xl text-xs font-semibold transition active:scale-[0.97] ${
                            paymentMethod === method
                              ? "bg-gold-300 text-[#241a02]"
                              : "border border-line bg-surface-2 text-text-muted"
                          }`}
                        >
                          {PAYMENT_METHOD_LABEL[method]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleMarkPaid}
                    disabled={saving}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-green-400 to-green-600 text-base font-bold text-[#052012] shadow-green transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {saving ? <Spinner size={20} /> : "Marcar como pagado"}
                  </button>
                </>
              )}

              {!canRelease ? null : !confirmingRelease ? (
                <button
                  type="button"
                  onClick={() => setConfirmingRelease(true)}
                  disabled={saving}
                  className="flex h-12 w-full items-center justify-center rounded-2xl border border-red-500/40 text-sm font-semibold text-red-400 transition active:scale-[0.98] disabled:opacity-50"
                >
                  Liberar número
                </button>
              ) : (
                <div className="space-y-2 rounded-2xl border border-red-500/40 bg-red-950/30 p-3">
                  <p className="text-sm text-red-200">
                    ¿Liberar el número {formatNumberValue(number.value)}? Se borrarán los datos del comprador.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingRelease(false)}
                      disabled={saving}
                      className="h-11 flex-1 rounded-xl border border-line text-sm font-semibold text-text"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleRelease}
                      disabled={saving}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white"
                    >
                      {saving ? <Spinner size={16} /> : "Sí, liberar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {photoViewerOpen && shownPhoto && (
        <div
          className="fixed inset-0 z-[110] flex animate-fade-in items-center justify-center bg-black/95 p-4"
          onClick={() => setPhotoViewerOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shownPhoto} alt="Comprobante ampliado" className="max-h-full max-w-full rounded-lg object-contain" />
          <button
            type="button"
            onClick={() => setPhotoViewerOpen(false)}
            aria-label="Cerrar"
            className="absolute right-5 top-[calc(env(safe-area-inset-top,0px)+1rem)] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-sm font-semibold text-text">{value}</span>
    </div>
  );
}

