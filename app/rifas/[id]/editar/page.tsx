"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, getRaffleById } from "@/lib/api-client";
import type { RaffleDTO } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { RaffleForm } from "@/components/RaffleForm";
import { Spinner } from "@/components/Spinner";

export default function EditRafflePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const raffleId = params.id;
  const { user, loading: authLoading, signOut } = useAuth();

  const [raffle, setRaffle] = useState<RaffleDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  // Only an ORGANIZER can edit a raffle — SELLER and SUPERADMIN never see this form.
  useEffect(() => {
    if (!authLoading && user && user.role !== "ORGANIZER") {
      router.replace(user.role === "SUPERADMIN" ? "/usuarios" : "/");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || user.role !== "ORGANIZER") return;
    let cancelled = false;

    async function load() {
      try {
        const data = await getRaffleById(raffleId);
        if (!cancelled) setRaffle(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 404
              ? "Esta rifa no existe o ya no está disponible."
              : "No se pudo cargar la rifa. Verifica tu conexión.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, raffleId]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  if (authLoading || !user || user.role !== "ORGANIZER") {
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
        title="Editar rifa"
        subtitle="Actualiza los datos y los colores del tablero."
        backHref={`/rifas/${raffleId}`}
        backLabel="Volver a la rifa"
      />

      <main className="mt-4 flex-1 px-4 sm:px-6 lg:px-8">
        {loading && (
          <div className="flex flex-1 items-center justify-center py-24">
            <Spinner size={32} className="text-gold-400" />
          </div>
        )}

        {!loading && error && (
          <p className="mx-auto max-w-xl text-center text-text-muted">{error}</p>
        )}

        {!loading && !error && raffle && <RaffleForm mode="edit" raffle={raffle} />}
      </main>
    </div>
  );
}
