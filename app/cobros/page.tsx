"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import { ApiError, getBillingSettings, getPackRequests, reviewPackRequest, saveBillingSettings } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import type { BillingSettingsDTO, PackRequestDTO } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";

const STATUS: Record<PackRequestDTO["status"], { label: string; tone: string }> = {
  pending: { label: "Por revisar", tone: "border-gold-600/50 text-gold-400" },
  approved: { label: "Aprobado", tone: "border-green-500/40 text-green-300" },
  rejected: { label: "Rechazado", tone: "border-red-500/40 text-red-300" },
};

/**
 * The superadmin's Cobros: the Bre-B key organizers transfer to when they pay a pack by hand, and the receipts
 * they send, to approve (the pack's raffles are added and the raffle activates) or reject with a reason.
 */
export default function BillingPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { show } = useToast();
  const [settings, setSettings] = useState<BillingSettingsDTO | null>(null);
  const [rows, setRows] = useState<PackRequestDTO[] | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user && user.role !== "SUPERADMIN") router.replace("/rifas");
  }, [loading, user, router]);

  const load = useCallback(() => {
    getPackRequests()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    if (user?.role !== "SUPERADMIN") return;
    getBillingSettings()
      .then(setSettings)
      .catch(() => {});
    load();
  }, [user, load]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  if (loading || !user || user.role !== "SUPERADMIN") {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center">
        <Spinner size={32} className="text-gold-400" />
      </div>
    );
  }

  const pending = rows?.filter((r) => r.status === "pending") ?? [];
  const reviewed = rows?.filter((r) => r.status !== "pending") ?? [];

  return (
    <div className="flex min-h-dvh flex-1 flex-col pb-10">
      <AppHeader
        userName={user.name}
        onLogout={handleLogout}
        title="Cobros"
        subtitle="Paquetes de rifas pagados por transferencia"
        backHref="/usuarios"
        backLabel="Volver"
      />
      <main className="mx-auto mt-4 w-full max-w-2xl flex-1 space-y-6 px-4 sm:px-6">
        <BrebCard settings={settings} onSaved={(s) => { setSettings(s); show("Llave guardada", "success"); }} onError={(m) => show(m, "error")} />

        <section aria-label="Comprobantes por revisar">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
            Por revisar{pending.length ? ` (${pending.length})` : ""}
          </h2>
          {rows === null ? (
            <div className="flex justify-center py-10">
              <Spinner size={24} className="text-gold-400" />
            </div>
          ) : pending.length === 0 ? (
            <p className="rounded-2xl border border-line bg-bg-elevated p-4 text-sm text-text-muted">No hay comprobantes esperando.</p>
          ) : (
            <ul className="space-y-3">
              {pending.map((r) => (
                <PendingRequest
                  key={r.id}
                  row={r}
                  onDone={(msg) => {
                    show(msg, "success");
                    load();
                  }}
                  onError={(m) => show(m, "error")}
                />
              ))}
            </ul>
          )}
        </section>

        {reviewed.length > 0 && (
          <section aria-label="Comprobantes revisados">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Revisados</h2>
            <ul className="space-y-2">
              {reviewed.map((r) => (
                <li key={r.id} className="rounded-2xl border border-line bg-bg-elevated p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-semibold text-text">{r.organization}</p>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {r.raffles} rifas · {formatCurrency(r.amount)} · {r.reviewedAt ? formatDate(r.reviewedAt) : ""}
                    {r.reviewedByName ? ` · ${r.reviewedByName}` : ""}
                  </p>
                  {r.rejectReason && <p className="mt-0.5 text-xs text-red-300">{r.rejectReason}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function BrebCard({
  settings,
  onSaved,
  onError,
}: {
  settings: BillingSettingsDTO | null;
  onSaved: (s: BillingSettingsDTO) => void;
  onError: (m: string) => void;
}) {
  const [key, setKey] = useState<string | null>(null);
  const [holder, setHolder] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!settings) return null;
  const keyValue = key ?? settings.breb?.key ?? "";
  const holderValue = holder ?? settings.breb?.holder ?? "";
  const changed = keyValue.trim() !== (settings.breb?.key ?? "") || holderValue.trim() !== (settings.breb?.holder ?? "");

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await saveBillingSettings(keyValue.trim(), holderValue.trim()));
      setKey(null);
      setHolder(null);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Tu llave Bre-B" className="space-y-3 rounded-2xl border border-line bg-bg-elevated p-4 shadow-card">
      <div>
        <p className="text-sm font-semibold text-text">Tu llave Bre-B para cobrar paquetes</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Los organizadores transfieren aquí el valor del paquete y te envían el comprobante.{" "}
          {settings.packs.map((p) => `${p.raffles} rifas por ${formatCurrency(p.price)}`).join(" · ")}.
        </p>
      </div>
      <label className="block">
        <span className="text-xs text-text-muted">Llave (celular, cédula, correo o @alias)</span>
        <input
          type="text"
          value={keyValue}
          onChange={(e) => setKey(e.target.value)}
          maxLength={80}
          placeholder="3001234567"
          className="mt-1 h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base text-text focus:border-gold-500 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-xs text-text-muted">A nombre de</span>
        <input
          type="text"
          value={holderValue}
          onChange={(e) => setHolder(e.target.value)}
          maxLength={80}
          placeholder="Tu nombre como sale en el banco"
          className="mt-1 h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base text-text focus:border-gold-500 focus:outline-none"
        />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !changed || keyValue.trim().length < 3}
        className="flex h-11 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-bold text-[#241a02] disabled:opacity-50"
      >
        {saving ? <Spinner size={16} /> : "Guardar llave"}
      </button>
      <p className="text-xs text-text-muted">
        Pago en línea automático (pagoradar): {settings.payOnline ? "activo" : "no configurado"}.
        {settings.payOnline && settings.breb ? " Los organizadores eligen cómo pagar." : ""}
      </p>
    </section>
  );
}

function PendingRequest({ row, onDone, onError }: { row: PackRequestDTO; onDone: (msg: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [zoom, setZoom] = useState(false);

  const act = async (action: "approve" | "reject") => {
    setBusy(true);
    try {
      await reviewPackRequest(row.id, action, action === "reject" ? reason.trim() : undefined);
      onDone(action === "approve" ? `Aprobado: ${row.raffles} rifas para ${row.organization}` : "Comprobante rechazado");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "No se pudo completar. Inténtalo de nuevo.");
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-gold-600/40 bg-bg-elevated p-4 shadow-card">
      <div className="flex gap-3">
        {row.receiptDataUrl && (
          <button type="button" onClick={() => setZoom(true)} aria-label="Ver comprobante" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.receiptDataUrl} alt="" className="h-24 w-20 rounded-xl border border-line object-cover" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text">{row.organization}</p>
          <p className="mt-0.5 font-[family-name:var(--font-heading)] text-xl font-extrabold text-gold-400">{formatCurrency(row.amount)}</p>
          <p className="text-xs text-text-muted">Paquete de {row.raffles} rifas{row.raffleName ? ` · desde «${row.raffleName}»` : ""}</p>
          <p className="text-xs text-text-muted">
            {formatDate(row.createdAt)}
            {row.payerName ? ` · pagó ${row.payerName}` : ""}
          </p>
        </div>
      </div>
      {rejecting ? (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="¿Por qué? (ej. el monto no coincide)"
            aria-label="Motivo del rechazo"
            autoFocus
            className="h-11 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base text-text focus:border-gold-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setRejecting(false)} disabled={busy} className="h-11 flex-1 rounded-2xl border border-line text-sm font-semibold text-text">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void act("reject")}
              disabled={busy || !reason.trim()}
              className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-red-500/90 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? <Spinner size={16} /> : "Rechazar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setRejecting(true)} disabled={busy} className="h-11 flex-1 rounded-2xl border border-red-500/50 text-sm font-semibold text-red-300">
            Rechazar
          </button>
          <button
            type="button"
            onClick={() => void act("approve")}
            disabled={busy}
            className="flex h-11 flex-[2] items-center justify-center rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-bold text-[#241a02] disabled:opacity-50"
          >
            {busy ? <Spinner size={16} /> : `Aprobar y dar ${row.raffles} rifas`}
          </button>
        </div>
      )}
      {zoom && row.receiptDataUrl && (
        <BottomSheet title="Comprobante" subtitle={`${row.organization} · ${formatCurrency(row.amount)}`} onClose={() => setZoom(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.receiptDataUrl} alt="Comprobante de pago" className="mx-auto max-h-[70dvh] w-auto rounded-xl" />
        </BottomSheet>
      )}
    </li>
  );
}
