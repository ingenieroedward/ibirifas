"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import { actOnPayment, ApiError, getOpenReservations, getReceivedPayments, type PaymentAction } from "@/lib/api-client";
import type { PaymentCandidateDTO, ReceivedPaymentDTO, ReceivedPaymentsDTO } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { AppHeader } from "@/components/AppHeader";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";
import { PaymentsAccountCard } from "@/components/PaymentsAccountCard";

type Filter = "pending" | "approved" | "ignored";

const TABS: { id: Filter; label: string }[] = [
  { id: "pending", label: "Por revisar" },
  { id: "approved", label: "Aprobados" },
  { id: "ignored", label: "Ignorados" },
];

const when = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

const MATCH_TEXT: Record<PaymentCandidateDTO["nameMatch"], { text: string; className: string }> = {
  strong: { text: "El nombre coincide", className: "text-green-400" },
  weak: { text: "El nombre coincide en parte", className: "text-gold-400" },
  none: { text: "El nombre no coincide", className: "text-text-muted" },
};

/**
 * "Pagos": the organizer's Bre-B account connected to pagoradar (connect, change, disconnect, automatic
 * approval) and "Pagos recibidos", the payments the bank reported and what happened to each — approved on its
 * own (with "Deshacer"), waiting for the team with its possible reservations, or set aside.
 */
export default function PaymentsPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { show } = useToast();
  const [filter, setFilter] = useState<Filter>("pending");
  const [data, setData] = useState<ReceivedPaymentsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<ReceivedPaymentDTO | null>(null);
  // Two views: the payments the bank reported, and the account setup (shown first only while not connected).
  const [view, setView] = useState<"payments" | "settings" | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && user?.role === "SUPERADMIN") router.replace("/usuarios");
    // Only the organizer sees what reaches the account (it may receive other payments too).
    if (!authLoading && user?.role === "SELLER") router.replace("/rifas");
  }, [authLoading, user, router]);

  const load = useCallback(async (f: Filter) => {
    try {
      setData(await getReceivedPayments(f));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los pagos. Verifica tu conexión.");
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== "ORGANIZER") return;
    let cancelled = false;
    getReceivedPayments(filter)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "No se pudieron cargar los pagos. Verifica tu conexión.");
      });
    return () => {
      cancelled = true;
    };
  }, [user, filter]);

  const act = async (payment: ReceivedPaymentDTO, input: PaymentAction, done: string) => {
    setBusy(payment.id);
    try {
      await actOnPayment(payment.id, input);
      show(done, "success");
      setAssigning(null);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "No se pudo completar. Inténtalo de nuevo.", "error");
    } finally {
      setBusy(null);
      await load(filter);
    }
  };

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  const current = view ?? (data && !data.enabled ? "settings" : "payments");

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center py-24">
        <Spinner size={32} className="text-gold-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col pb-10">
      <AppHeader
        userName={user.name}
        onLogout={handleLogout}
        title="Pagos"
        subtitle="Tu cuenta Bre-B conectada y los pagos que avisó el banco."
        backHref="/rifas"
        backLabel="Volver a tus rifas"
      />
      <main className="mt-4 flex-1 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          <div role="tablist" aria-label="Pagos" className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-bg-elevated p-1">
            {(
              [
                { id: "payments", label: `Pagos recibidos${data && data.pending > 0 ? ` (${data.pending})` : ""}` },
                { id: "settings", label: "Configuración" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={current === t.id}
                onClick={() => setView(t.id)}
                className={`h-11 rounded-xl text-sm font-semibold transition ${
                  current === t.id ? "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02]" : "text-text-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {current === "settings" && user.role === "ORGANIZER" && (
            <PaymentsAccountCard
              onNotify={show}
              defaultEmail={null}
              onChange={() => {
                setView("settings");
                void load(filter);
              }}
            />
          )}
          {current === "payments" && data && !data.enabled ? (
            <div className="rounded-2xl border border-line bg-bg-elevated p-4 text-sm text-text-muted">
              <p>Cuando conectes tu cuenta, aquí verás cada pago que llegue y la reserva que pagó.</p>
              <button
                type="button"
                onClick={() => setView("settings")}
                className="mt-3 text-sm font-semibold text-gold-400 underline-offset-2 hover:underline"
              >
                Conectar mi cuenta
              </button>
            </div>
          ) : current === "payments" ? (
            <>
              <div role="tablist" aria-label="Filtrar pagos" className="flex gap-2">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === t.id}
                    onClick={() => setFilter(t.id)}
                    className={`h-9 rounded-full border px-4 text-xs font-semibold transition sm:text-sm ${
                      filter === t.id ? "border-gold-500 bg-gold-400/15 text-gold-400" : "border-line text-text-muted"
                    }`}
                  >
                    {t.label}
                    {t.id === "pending" && data && data.pending > 0 ? ` (${data.pending})` : ""}
                  </button>
                ))}
              </div>
              {data && !data.autoApprove && (
                <p className="text-xs text-text-muted">
                  La aprobación automática está apagada: cada pago espera a que alguien lo apruebe (se cambia en Configuración).
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm font-medium text-red-400">
                  {error}
                </p>
              )}
              {!data && !error && (
                <div className="flex justify-center py-12">
                  <Spinner size={28} className="text-gold-400" />
                </div>
              )}
              {data && data.payments.length === 0 && (
                <p className="py-10 text-center text-sm text-text-muted">
                  {filter === "pending"
                    ? "No hay pagos por revisar."
                    : filter === "approved"
                      ? "Todavía no hay pagos aprobados."
                      : "No hay pagos ignorados."}
                </p>
              )}
              {data?.payments.map((p) => (
                <PaymentCard
                  key={p.id}
                  payment={p}
                  busy={busy === p.id}
                  onApprove={(c) =>
                    act(p, { action: "approve", numberIds: c.numberIds }, `Pago aprobado: ${c.buyerName ?? "reserva"} · ${c.items}`)
                  }
                  onUndo={() => {
                    if (window.confirm("¿Deshacer la aprobación? Los números vuelven a quedar apartados sin pagar.")) {
                      void act(p, { action: "undo" }, "Aprobación deshecha: el pago quedó por revisar.");
                    }
                  }}
                  onIgnore={() => act(p, { action: "ignore" }, "Pago ignorado.")}
                  onReopen={() => act(p, { action: "reopen" }, "El pago volvió a revisión.")}
                  onAssign={() => setAssigning(p)}
                />
              ))}
            </>
          ) : null}
        </div>
      </main>
      {assigning && (
        <AssignSheet
          payment={assigning}
          busy={busy === assigning.id}
          onClose={() => setAssigning(null)}
          onPick={(c) => act(assigning, { action: "approve", numberIds: c.numberIds }, `Pago aprobado: ${c.buyerName ?? "reserva"} · ${c.items}`)}
        />
      )}
    </div>
  );
}

function PaymentCard({
  payment: p,
  busy,
  onApprove,
  onUndo,
  onIgnore,
  onReopen,
  onAssign,
}: {
  payment: ReceivedPaymentDTO;
  busy: boolean;
  onApprove: (c: PaymentCandidateDTO) => void;
  onUndo: () => void;
  onIgnore: () => void;
  onReopen: () => void;
  onAssign: () => void;
}) {
  const waiting = p.status === "review" || p.status === "unmatched";
  return (
    <article className="space-y-3 rounded-2xl border border-line bg-bg-elevated p-4 shadow-card" aria-label={`Pago de ${p.payerName}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-heading)] text-2xl font-extrabold text-text">{formatCurrency(p.amount)}</p>
          <p className="break-words text-sm font-semibold text-text">{p.payerName}</p>
          <p className="text-xs text-text-muted">
            {[p.bankLabel, p.payerBank ? `desde ${p.payerBank}` : null, when.format(new Date(p.paidAt)), p.reference ? `Ref. ${p.reference}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <StatusChip payment={p} />
      </div>

      {(p.status === "auto" || p.status === "approved") && (
        <>
          <p className="rounded-xl bg-green-500/10 px-3 py-2 text-sm text-text">
            <span className="font-semibold">{p.matchLabel}</span>
            <span className="block text-xs text-text-muted">
              {p.status === "auto" ? "Se aprobó solo: monto, nombre y hora coinciden con una sola reserva." : `Lo aprobó ${p.resolvedByName ?? "el equipo"}.`}
            </span>
          </p>
          <button
            type="button"
            onClick={onUndo}
            disabled={busy}
            className="flex h-10 w-full items-center justify-center rounded-xl border border-line text-sm font-semibold text-text-muted transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Spinner size={16} /> : "Deshacer"}
          </button>
        </>
      )}

      {waiting && (
        <>
          {p.note && <p className="text-sm text-text-muted">{p.note}</p>}
          {p.candidates.length > 0 && (
            <ul className="space-y-2">
              {p.candidates.map((c) => (
                <li key={c.key} className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
                  <div className="min-w-0 text-sm">
                    <p className="break-words font-semibold text-text">{c.buyerName ?? "Sin nombre"}</p>
                    <p className="break-words text-xs text-text-muted">
                      {c.raffleName} · {c.items} · {formatCurrency(c.amount)}
                    </p>
                    <p className="break-words text-xs text-text-muted">
                      {c.payerName ? `Titular que escribió: ${c.payerName}` : c.online ? "Sin comprobante todavía" : "Venta del equipo"}
                      {c.hasReceipt ? " · con comprobante" : ""}
                    </p>
                    <p className={`text-xs font-semibold ${MATCH_TEXT[c.nameMatch].className}`}>{MATCH_TEXT[c.nameMatch].text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onApprove(c)}
                    disabled={busy}
                    className="flex h-10 w-full items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-bold text-[#241a02] transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {busy ? <Spinner size={16} /> : "Aprobar con esta reserva"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onAssign}
              disabled={busy}
              className="flex h-10 items-center justify-center rounded-xl border border-gold-600/50 text-sm font-semibold text-gold-400 transition active:scale-[0.98] disabled:opacity-50"
            >
              {p.candidates.length > 0 ? "Otra reserva" : "Asignar a reserva"}
            </button>
            <button
              type="button"
              onClick={onIgnore}
              disabled={busy}
              className="flex h-10 items-center justify-center rounded-xl border border-line text-sm font-semibold text-text-muted transition active:scale-[0.98] disabled:opacity-50"
            >
              Ignorar
            </button>
          </div>
        </>
      )}

      {p.status === "ignored" && (
        <>
          <p className="text-xs text-text-muted">Lo ignoró {p.resolvedByName ?? "el equipo"}.</p>
          <button
            type="button"
            onClick={onReopen}
            disabled={busy}
            className="flex h-10 w-full items-center justify-center rounded-xl border border-line text-sm font-semibold text-text-muted transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Spinner size={16} /> : "Volver a revisar"}
          </button>
        </>
      )}
    </article>
  );
}

function StatusChip({ payment: p }: { payment: ReceivedPaymentDTO }) {
  const chip = {
    auto: { text: "Aprobado solo", className: "bg-green-500/15 text-green-400" },
    approved: { text: "Aprobado", className: "bg-green-500/15 text-green-400" },
    review: { text: "Por revisar", className: "bg-gold-400/15 text-gold-400" },
    unmatched: { text: "Sin reserva", className: "bg-red-500/15 text-red-400" },
    ignored: { text: "Ignorado", className: "bg-surface-2 text-text-muted" },
  }[p.status];
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${chip.className}`}>{chip.text}</span>;
}

/** Every open reservation, the same amount and best name matches first, to assign a payment by hand. */
function AssignSheet({
  payment,
  busy,
  onClose,
  onPick,
}: {
  payment: ReceivedPaymentDTO;
  busy: boolean;
  onClose: () => void;
  onPick: (c: PaymentCandidateDTO) => void;
}) {
  const [list, setList] = useState<PaymentCandidateDTO[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOpenReservations(payment.payerName, payment.amount)
      .then(setList)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudieron cargar las reservas."));
  }, [payment.payerName, payment.amount]);

  const q = query.trim().toLowerCase();
  const shown = (list ?? []).filter(
    (c) => !q || [c.buyerName, c.payerName, c.raffleName, c.items].some((v) => v?.toLowerCase().includes(q)),
  );

  return (
    <BottomSheet title="Asignar a una reserva" subtitle={`${formatCurrency(payment.amount)} · ${payment.payerName}`} onClose={onClose}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre, rifa o número"
        aria-label="Buscar reserva"
        className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-base text-text outline-none focus:border-gold-400"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!list && !error && (
        <div className="flex justify-center py-6">
          <Spinner size={24} className="text-gold-400" />
        </div>
      )}
      {list && shown.length === 0 && <p className="py-4 text-center text-sm text-text-muted">No hay reservas pendientes que coincidan.</p>}
      <ul className="space-y-2">
        {shown.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const differs = c.amount !== payment.amount;
                if (
                  !differs ||
                  window.confirm(
                    `Esa reserva vale ${formatCurrency(c.amount)} y el pago fue de ${formatCurrency(payment.amount)}. ¿Marcarla pagada de todas formas?`,
                  )
                ) {
                  onPick(c);
                }
              }}
              className="w-full rounded-xl border border-line bg-surface-2 p-3 text-left text-sm transition active:scale-[0.99] disabled:opacity-50"
            >
              <span className="block break-words font-semibold text-text">{c.buyerName ?? "Sin nombre"}</span>
              <span className="block break-words text-xs text-text-muted">
                {c.raffleName} · {c.items} ·{" "}
                <span className={c.amount === payment.amount ? "font-semibold text-green-400" : ""}>{formatCurrency(c.amount)}</span>
              </span>
              {c.payerName && <span className="block break-words text-xs text-text-muted">Titular que escribió: {c.payerName}</span>}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
