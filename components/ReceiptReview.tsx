"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import { Spinner } from "@/components/Spinner";

const QUICK_REASONS = ["No llegó el pago", "No se ve el valor o la fecha", "El valor no coincide", "No es un comprobante"];

/**
 * Under a buyer's receipt: reject it when it isn't valid (it is removed so they can send another, and a
 * buyer who left an email is told why). After a rejection, says so until a new receipt arrives.
 */
export function ReceiptReview({
  hasReceipt,
  rejectedAt,
  rejectReason,
  buyerEmail,
  onReject,
}: {
  hasReceipt: boolean;
  rejectedAt: string | null;
  rejectReason: string | null;
  buyerEmail: string | null;
  onReject: (reason: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  if (!hasReceipt) {
    return rejectedAt ? (
      <p role="status" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
        Comprobante rechazado el {formatDate(rejectedAt)}
        {rejectReason ? ` · ${rejectReason}` : ""}. Esperando uno nuevo.
      </p>
    ) : null;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 w-full rounded-2xl border border-red-500/40 text-sm font-semibold text-red-400 transition active:scale-[0.98]"
      >
        Rechazar comprobante
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-red-500/40 bg-red-950/20 p-3">
      <label htmlFor="rejectReason" className="text-sm font-medium text-text">
        ¿Por qué no es válido? (opcional)
      </label>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_REASONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setReason(q)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
              reason === q ? "bg-red-500/80 text-white" : "border border-line text-text-muted"
            }`}
          >
            {q}
          </button>
        ))}
      </div>
      <input
        id="rejectReason"
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={200}
        placeholder="Escribe el motivo"
        className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-base text-text outline-none focus:border-gold-400"
      />
      <p className="text-xs text-text-muted">
        El comprobante se quita y la reserva sigue activa para que envíe otro.
        {buyerEmail ? ` Le avisamos a ${buyerEmail}.` : ""}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={saving}
          className="h-11 flex-1 rounded-xl border border-line text-sm font-semibold text-text"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              await onReject(reason.trim() || null);
              setOpen(false);
              setReason("");
            } catch {
              // The page showed the error.
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
          className="flex h-11 flex-1 items-center justify-center rounded-xl bg-red-600 text-sm font-semibold text-white"
        >
          {saving ? <Spinner size={16} /> : "Rechazar"}
        </button>
      </div>
    </div>
  );
}
