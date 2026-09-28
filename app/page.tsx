"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, getRaffles } from "@/lib/api-client";
import type { RaffleSummaryDTO } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { RafflePicker } from "@/components/RafflePicker";
import { Spinner } from "@/components/Spinner";

export default function HomePage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [raffles, setRaffles] = useState<RaffleSummaryDTO[] | null>(null);
  const [loadingRaffles, setLoadingRaffles] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Middleware already redirects unauthenticated requests server-side; this
  // is the client-side fallback for when the session expires in-app.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  // This screen is the ORGANIZER/SELLER entry point. SUPERADMIN has their own
  // landing and never sees a raffle grid.
  useEffect(() => {
    if (!authLoading && user?.role === "SUPERADMIN") {
      router.replace("/usuarios");
    }
  }, [authLoading, user, router]);

  // Local to this effect on purpose (not the shared useCallback below): the
  // initial load runs from an effect, and the retry button fetches separately.
  useEffect(() => {
    if (!user || user.role === "SUPERADMIN") return;
    let cancelled = false;

    async function bootstrapRaffles() {
      try {
        const data = await getRaffles();
        if (!cancelled) {
          setRaffles(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "No se pudieron cargar tus rifas. Verifica tu conexión.",
          );
        }
      } finally {
        if (!cancelled) setLoadingRaffles(false);
      }
    }

    bootstrapRaffles();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadRaffles = useCallback(async () => {
    setLoadingRaffles(true);
    setError(null);
    try {
      const data = await getRaffles();
      setRaffles(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudieron cargar tus rifas. Verifica tu conexión.",
      );
    } finally {
      setLoadingRaffles(false);
    }
  }, []);

  // Exactly one raffle: skip the picker entirely.
  useEffect(() => {
    if (raffles && raffles.length === 1) {
      router.replace(`/rifas/${raffles[0].id}`);
    }
  }, [raffles, router]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  if (authLoading || !user || user.role === "SUPERADMIN") {
    return <FullScreenSpinner />;
  }

  if (loadingRaffles || !raffles || raffles.length === 1) {
    return <FullScreenSpinner />;
  }

  if (error) {
    return (
      <div className="flex min-h-dvh flex-1 flex-col">
        <AppHeader userName={user.name} onLogout={handleLogout} title="Tus rifas" />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="max-w-xs text-text-muted">{error}</p>
          <button
            type="button"
            onClick={loadRaffles}
            className="rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-5 py-2.5 text-sm font-semibold text-[#241a02] shadow-gold active:scale-95"
          >
            Reintentar
          </button>
        </main>
      </div>
    );
  }

  const isOrganizer = user.role === "ORGANIZER";

  if (raffles.length === 0) {
    return (
      <div className="flex min-h-dvh flex-1 flex-col">
        <AppHeader userName={user.name} onLogout={handleLogout} title="Tus rifas" />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="max-w-xs text-text-muted">
            {isOrganizer
              ? "Aún no tienes ninguna rifa. Crea la primera para empezar a vender números."
              : "Tu organizador todavía no ha creado ninguna rifa."}
          </p>
          {isOrganizer && (
            <Link
              href="/rifas/nueva"
              className="rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 px-6 py-3 text-base font-bold text-[#241a02] shadow-gold transition active:scale-95"
            >
              Crear rifa
            </Link>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col pb-10">
      <AppHeader
        userName={user.name}
        onLogout={handleLogout}
        title="Tus rifas"
        subtitle="Elige una rifa para gestionar sus números."
        links={
          isOrganizer
            ? [
                { href: "/rifas/nueva", label: "Crear rifa" },
                { href: "/usuarios", label: "Mi equipo" },
              ]
            : []
        }
      />
      <main className="mt-4 flex-1 px-4">
        <RafflePicker raffles={raffles} />
      </main>
    </div>
  );
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center py-24">
      <Spinner size={32} className="text-gold-400" />
    </div>
  );
}
