"use client";

import { useState, type ReactNode } from "react";
import type { PaymentMethod, RaffleGroupDTO, RaffleNumberDTO } from "@/lib/types";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { groupStatus } from "@/lib/groups";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/payment";
import { BottomSheet } from "@/components/BottomSheet";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Spinner } from "@/components/Spinner";

interface GroupSheetProps {
  group: RaffleGroupDTO;
  /** Every number of the set, ordered by value. */
  members: RaffleNumberDTO[];
  /** Names already used in this raffle, offered as suggestions so one buyer isn't typed two ways. */
  knownBuyers: string[];
  /** False once the raffle is closed: sets can no longer be freed. */
  canRelease?: boolean;
  onClose: () => void;
  onSell: (input: { buyerName: string; buyerPhone: string | null; photoDataUrl: string | null }) => Promise<void>;
  onPay: (method: PaymentMethod) => Promise<void>;
  onUnpay: () => Promise<void>;
  onEdit: (input: { buyerName: string; buyerPhone: string | null }) => Promise<void>;
  onRelease: () => Promise<void>;
}

const STATUS_LABEL = { available: "Disponible", occupied: "Vendido · pendiente de pago", paid: "Vendido y pagado" } as const;

/**
 * Everything you can do with a lettered set. A set is one unit: it's sold to a
 * single buyer for its own price, and collected or freed as a whole.
 */
export function GroupSheet({ group, members, knownBuyers, canRelease = true, onClose, onSell, onPay, onUnpay, onEdit, onRelease }: GroupSheetProps) {
  const status = groupStatus(members);
  const first = members[0];

  const [buyerName, setBuyerName] = useState(first?.buyerName ?? "");
  const [buyerPhone, setBuyerPhone] = useState(first?.buyerPhone ?? "");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(first?.paymentMethod ?? "cash");
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isAvailable = status === "available";
  const savedPhoto = first?.photoDataUrl ?? null;
  const detailsChanged =
    !isAvailable &&
    (buyerName.trim() !== (first?.buyerName ?? "") || (buyerPhone.trim() || null) !== (first?.buyerPhone ?? null));

  /** Runs one action; the page closes the sheet on success and toasts the error, so a failure just re-enables the buttons. */
  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setFormError(null);
    try {
      await action();
    } catch {
      setSaving(false);
      setConfirmingRelease(false);
    }
  };

  const handleSell = () => {
    const name = buyerName.trim();
    if (!name) {
      setFormError("El nombre del comprador es obligatorio.");
      return;
    }
    return run(() => onSell({ buyerName: name, buyerPhone: buyerPhone.trim() || null, photoDataUrl }));
  };

  const handleSaveDetails = () => {
    const name = buyerName.trim();
    if (!name) {
      setFormError("El nombre del comprador es obligatorio.");
      return;
    }
    return run(() => onEdit({ buyerName: name, buyerPhone: buyerPhone.trim() || null }));
  };

  return (
    <BottomSheet
      title={`Conjunto ${group.label}`}
      subtitle={`${STATUS_LABEL[status]} · ${formatCurrency(group.price)} · ${members.length} ${members.length === 1 ? "número" : "números"}`}
      onClose={saving ? () => {} : onClose}
    >
      <div className="flex flex-wrap gap-2">
        {members.map((n) => (
          <span
            key={n.id}
            className={`flex h-10 min-w-10 items-center justify-center rounded-xl px-2.5 font-[family-name:var(--font-heading)] text-base font-bold ${
              n.status === "paid"
                ? "bg-gradient-to-b from-green-400 to-green-600 text-[#052012]"
                : n.status === "occupied"
                  ? "border border-line bg-surface-2 text-text-muted"
                  : "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02]"
            }`}
          >
            {formatNumberValue(n.value)}
          </span>
        ))}
      </div>

      {isAvailable ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="groupBuyerName" className="text-sm font-medium text-text-muted">
              Nombre del comprador <span className="text-gold-400">*</span>
            </label>
            <input
              id="groupBuyerName"
              type="text"
              list="known-buyers-group"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Ej. María Pérez"
              autoComplete="off"
              disabled={saving}
              className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
            />
            <datalist id="known-buyers-group">
              {knownBuyers.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="groupBuyerPhone" className="text-sm font-medium text-text-muted">
              Teléfono (opcional)
            </label>
            <input
              id="groupBuyerPhone"
              type="tel"
              inputMode="tel"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              placeholder="Ej. 3001234567"
              autoComplete="tel"
              disabled={saving}
              className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
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
              `Vender conjunto ${group.label} · ${formatCurrency(group.price)}`
            )}
          </button>
        </>
      ) : (
        <>
          <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
            <InfoRow label="Precio del conjunto" value={formatCurrency(group.price)} />
            {first?.updatedByName && <InfoRow label="Registrado por" value={first.updatedByName} />}
            <InfoRow
              label="Pago"
              value={
                status === "paid"
                  ? first?.paymentMethod
                    ? `Pagado · ${PAYMENT_METHOD_LABEL[first.paymentMethod]}`
                    : "Pagado"
                  : "Pendiente"
              }
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="groupBuyerName" className="text-sm font-medium text-text-muted">
              Comprador
            </label>
            <input
              id="groupBuyerName"
              type="text"
              list="known-buyers-group"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              autoComplete="off"
              disabled={saving}
              className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
            />
            <datalist id="known-buyers-group">
              {knownBuyers.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="groupBuyerPhone" className="text-sm font-medium text-text-muted">
              Teléfono
            </label>
            <input
              id="groupBuyerPhone"
              type="tel"
              inputMode="tel"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              autoComplete="tel"
              disabled={saving}
              className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
            />
          </div>

          {detailsChanged && (
            <button
              type="button"
              onClick={handleSaveDetails}
              disabled={saving || buyerName.trim().length === 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-gold-600/50 text-sm font-semibold text-gold-400 transition active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? <Spinner size={16} /> : "Guardar datos del comprador"}
            </button>
          )}

          {savedPhoto && (
            <button
              type="button"
              onClick={() => setPhotoViewerOpen(true)}
              className="block h-48 w-full overflow-hidden rounded-2xl border border-line"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={savedPhoto} alt="Comprobante" className="h-full w-full object-cover" />
            </button>
          )}

          {formError && <p className="text-sm font-medium text-red-400">{formError}</p>}

          <div className="space-y-2.5">
            {status === "occupied" ? (
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
                            ? "bg-gold-400 text-[#241a02]"
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
                  onClick={() => run(() => onPay(paymentMethod))}
                  disabled={saving}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-green-400 to-green-600 text-base font-bold text-[#052012] shadow-green transition active:scale-[0.98] disabled:opacity-50"
                >
                  {saving ? <Spinner size={20} /> : `Marcar conjunto ${group.label} como pagado`}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => run(onUnpay)}
                disabled={saving}
                className="flex h-12 w-full items-center justify-center rounded-2xl border border-line text-sm font-semibold text-text-muted transition active:scale-[0.98] disabled:opacity-50"
              >
                Deshacer el pago
              </button>
            )}

            {!canRelease ? null : !confirmingRelease ? (
              <button
                type="button"
                onClick={() => setConfirmingRelease(true)}
                disabled={saving}
                className="flex h-12 w-full items-center justify-center rounded-2xl border border-red-500/40 text-sm font-semibold text-red-400 transition active:scale-[0.98] disabled:opacity-50"
              >
                Liberar conjunto
              </button>
            ) : (
              <div className="space-y-2 rounded-2xl border border-red-500/40 bg-red-950/30 p-3">
                <p className="text-sm text-red-200">
                  ¿Liberar el conjunto {group.label}? Sus {members.length} números vuelven a estar disponibles y se
                  borran los datos del comprador.
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
                    onClick={() => run(onRelease)}
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

      {photoViewerOpen && savedPhoto && (
        <div
          className="fixed inset-0 z-[110] flex animate-fade-in items-center justify-center bg-black/95 p-4"
          onClick={() => setPhotoViewerOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={savedPhoto} alt="Comprobante ampliado" className="max-h-full max-w-full rounded-lg object-contain" />
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
    </BottomSheet>
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
