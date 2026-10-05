"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getActivity } from "@/lib/api-client";
import { formatCurrency, formatDate, formatNumberValue } from "@/lib/format";
import type { ActivityDTO } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { Spinner } from "@/components/Spinner";

const ACTION: Record<string, { label: string; tone: string }> = {
  "raffle.trashed": { label: "Eliminó la rifa", tone: "border-red-500/40 text-red-300" },
  "raffle.restored": { label: "Restauró la rifa", tone: "border-green-500/40 text-green-300" },
  "raffle.purged": { label: "Se borró para siempre", tone: "border-line text-text-muted" },
};

/** The record of deleted, restored and purged raffles: every organization's for the platform owner, else one's own. */
export default function ActivityPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [rows, setRows] = useState<ActivityDTO[] | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user?.role === "SELLER") router.replace("/rifas");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || user.role === "SELLER") return;
    getActivity()
      .then(setRows)
      .catch(() => setRows([]));
  }, [user]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  if (loading || !user || user.role === "SELLER") {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center">
        <Spinner size={32} className="text-gold-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col pb-10">
      <AppHeader
        userName={user.name}
        onLogout={handleLogout}
        title="Actividad"
        subtitle={user.role === "SUPERADMIN" ? "Rifas eliminadas, restauradas y borradas en todas las organizaciones" : "Rifas eliminadas, restauradas y borradas"}
        backHref={user.role === "SUPERADMIN" ? "/usuarios" : "/rifas"}
        backLabel="Volver"
      />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 sm:px-6">
        {rows === null ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} className="text-gold-400" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-text-muted">Todavía no hay nada registrado.</p>
        ) : (
          <ul className="space-y-3" aria-label="Actividad">
            {rows.map((r) => {
              const a = ACTION[r.action] ?? { label: r.action, tone: "border-line text-text-muted" };
              const d = r.details as {
                sold?: number;
                paid?: number;
                numberPrice?: number;
                totalNumbers?: number;
                winnerValue?: number | null;
                activation?: { kind: string; amount: number | null } | null;
              } | null;
              return (
                <li key={r.id} className="rounded-2xl border border-line bg-bg-elevated p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-semibold text-text">«{r.targetName}»</p>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${a.tone}`}>{a.label}</span>
                  </div>
                  <p className="mt-1 text-sm text-text-muted">
                    {r.actorName} · {formatDate(r.createdAt)}
                    {r.organization ? ` · ${r.organization}` : ""}
                  </p>
                  {d && typeof d.sold === "number" && (
                    <p className="mt-1 text-xs text-text-muted">
                      {d.sold} de {d.totalNumbers} vendidos · {d.paid} pagados
                      {typeof d.paid === "number" && d.numberPrice ? ` · ~${formatCurrency(d.paid * d.numberPrice)} recogidos` : ""}
                      {d.winnerValue !== null && d.winnerValue !== undefined ? ` · ganó el ${formatNumberValue(d.winnerValue)}` : ""}
                      {d.activation ? ` · activación: ${d.activation.kind}${d.activation.amount ? ` ${formatCurrency(d.activation.amount)}` : ""}` : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
