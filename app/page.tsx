"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import { ApiError, getRaffle, updateNumber } from "@/lib/api-client";
import type { RaffleDTO, RaffleNumberDTO, UpdateNumberInput } from "@/lib/types";
import { DashboardHeader } from "@/components/DashboardHeader";
import { NumberGrid } from "@/components/NumberGrid";
import { NumberSheet } from "@/components/NumberSheet";
import { Spinner } from "@/components/Spinner";

/** `undefined` in a PATCH input means "leave unchanged"; `null` means "clear". */
function resolveField<T>(input: T | null | undefined, current: T | null): T | null {
  return input === undefined ? current : input;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { show } = useToast();

  const [raffle, setRaffle] = useState<RaffleDTO | null>(null);
  const [raffleLoading, setRaffleLoading] = useState(true);
  const [raffleError, setRaffleError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Middleware already redirects unauthenticated requests server-side; this
  // is the client-side fallback for when the session expires in-app.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  // Local to this effect on purpose (not a shared useCallback): the initial
  // load runs from an effect, and the retry button below fetches separately.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function bootstrapRaffle() {
      try {
        const data = await getRaffle();
        if (!cancelled) {
          setRaffle(data);
          setRaffleError(null);
        }
      } catch (err) {
        if (!cancelled) setRaffleError(raffleErrorMessage(err));
      } finally {
        if (!cancelled) setRaffleLoading(false);
      }
    }

    bootstrapRaffle();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadRaffle = useCallback(async () => {
    setRaffleLoading(true);
    setRaffleError(null);
    try {
      const data = await getRaffle();
      setRaffle(data);
    } catch (err) {
      setRaffleError(raffleErrorMessage(err));
    } finally {
      setRaffleLoading(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  const selected = raffle?.numbers.find((n) => n.id === selectedId) ?? null;

  const handleSave = useCallback(
    async (id: string, input: UpdateNumberInput) => {
      const previous = raffle;
      if (!previous) return;

      const applyInput = (n: RaffleNumberDTO): RaffleNumberDTO => ({
        ...n,
        status: input.status,
        buyerName: resolveField(input.buyerName, n.buyerName),
        buyerPhone: resolveField(input.buyerPhone, n.buyerPhone),
        photoDataUrl: resolveField(input.photoDataUrl, n.photoDataUrl),
        notes: resolveField(input.notes, n.notes),
      });

      // Optimistic update so the tap feels instant.
      setRaffle({
        ...previous,
        numbers: previous.numbers.map((n) => (n.id === id ? applyInput(n) : n)),
      });

      try {
        const updated = await updateNumber(id, input);
        setRaffle((current) =>
          current
            ? { ...current, numbers: current.numbers.map((n) => (n.id === id ? updated : n)) }
            : current,
        );
        show(successMessage(updated), "success");
      } catch (err) {
        setRaffle(previous);
        show(
          err instanceof ApiError ? err.message : "No se pudo guardar. Inténtalo de nuevo.",
          "error",
        );
        throw err;
      }
    },
    [raffle, show],
  );

  if (authLoading || !user) {
    return <FullScreenSpinner />;
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col pb-10">
      {raffle && <DashboardHeader raffle={raffle} userName={user.name} onLogout={handleLogout} />}

      <main className="mt-2 flex-1 px-4">
        {raffleLoading && <FullScreenSpinner />}

        {!raffleLoading && raffleError && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <p className="max-w-xs text-text-muted">{raffleError}</p>
            <button
              type="button"
              onClick={loadRaffle}
              className="rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-5 py-2.5 text-sm font-semibold text-[#241a02] shadow-gold active:scale-95"
            >
              Reintentar
            </button>
          </div>
        )}

        {!raffleLoading && !raffleError && raffle && (
          <NumberGrid numbers={raffle.numbers} onSelect={(n) => setSelectedId(n.id)} />
        )}
      </main>

      <NumberSheet
        number={selected}
        numberPrice={raffle?.numberPrice ?? 0}
        onClose={() => setSelectedId(null)}
        onSave={handleSave}
      />
    </div>
  );
}

function raffleErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return "Aún no tienes una rifa configurada.";
    return err.message;
  }
  return "No se pudo cargar la rifa. Verifica tu conexión.";
}

function successMessage(number: RaffleNumberDTO): string {
  const value = number.value.toString().padStart(2, "0");
  if (number.status === "available") return `Número ${value} liberado`;
  if (number.status === "paid") return `Número ${value} marcado como pagado`;
  return `Número ${value} vendido`;
}

function FullScreenSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner size={32} className="text-gold-400" />
    </div>
  );
}
