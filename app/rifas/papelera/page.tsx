"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import { ApiError, getTrash, restoreRaffle } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { TrashedRaffleDTO } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { Spinner } from "@/components/Spinner";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The organizer's trash: deleted raffles, who deleted them and when, and "Restaurar" for the next 30 days. */
export default function TrashPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { show } = useToast();
  const [items, setItems] = useState<TrashedRaffleDTO[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user && user.role !== "ORGANIZER") router.replace(user.role === "SUPERADMIN" ? "/usuarios" : "/rifas");
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.role !== "ORGANIZER") return;
    getTrash()
      .then(setItems)
      .catch(() => setItems([]));
  }, [user]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  const restore = async (item: TrashedRaffleDTO) => {
    setRestoring(item.id);
    try {
      await restoreRaffle(item.id);
      show(`«${item.name}» volvió a tus rifas`, "success");
      router.push(`/rifas/${item.id}`);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "No se pudo restaurar. Inténtalo de nuevo.", "error");
      setRestoring(null);
    }
  };

  if (loading || !user || user.role !== "ORGANIZER") {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center">
        <Spinner size={32} className="text-gold-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col pb-10">
      <AppHeader userName={user.name} onLogout={handleLogout} title="Papelera" subtitle="Rifas eliminadas en los últimos 30 días" backHref="/rifas" backLabel="Mis rifas" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 sm:px-6">
        {items === null ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} className="text-gold-400" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-text-muted">La papelera está vacía.</p>
        ) : (
          <ul className="space-y-3" aria-label="Rifas en la papelera">
            {items.map((item) => {
              const daysLeft = Math.max(0, Math.ceil((new Date(item.purgeAt).getTime() - now) / DAY_MS));
              return (
                <li key={item.id} className="rounded-2xl border border-line bg-bg-elevated p-4 shadow-card">
                  <p className="font-[family-name:var(--font-heading)] text-lg font-bold text-text">{item.name}</p>
                  <p className="mt-0.5 text-sm text-text-muted">
                    Eliminada{item.deletedByName ? ` por ${item.deletedByName}` : ""} el {formatDate(item.deletedAt)}
                  </p>
                  <p className="text-xs text-text-muted">
                    {daysLeft === 0 ? "Se borra hoy para siempre" : `Se borra para siempre en ${daysLeft} ${daysLeft === 1 ? "día" : "días"}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => void restore(item)}
                    disabled={restoring !== null}
                    className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border border-gold-600/50 text-sm font-bold text-gold-400 transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {restoring === item.id ? <Spinner size={16} /> : "Restaurar"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
